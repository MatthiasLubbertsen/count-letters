import { WebClient } from "@slack/web-api";
import { env } from "cloudflare:workers";
import { SlackApp } from "slack-cloudflare-workers";

type Awaitable<T> = Promise<T> | T;

const client = new WebClient(env.SLACK_BOT_TOKEN);
const countRegex = /^\s*([a-z]+)([^a-zA-Z]|$)/;

// By ChatGPT
function numberToString(n: number): string {
    if (n <= 0 || !Number.isInteger(n)) {
        throw new Error("Input must be a positive integer");
    }

    let result = "";

    while (n > 0) {
        n--; // shift to 0-based
        const remainder = n % 26;
        result = String.fromCharCode(97 + remainder) + result;
        n = Math.floor(n / 26);
    }

    return result;
}

// By ChatGPT
function stringToNumber(s: string): number {
    let result = 0;

    for (const char of s) {
        const value = char.charCodeAt(0) - 96; // 'a' = 1, 'z' = 26
        result = result * 26 + value;
    }

    return result;
}

export default {
	async scheduled(
		_controller: ScheduledController,
		env: Env,
		_ctx: ExecutionContext,
	) {
		const values = await Promise.all([
			env.STATE.get("lastDailyCount"),
			env.STATE.get("number")
		])
		const [lastDailyCount, number] = values.map(value => value ? parseInt(value) : null);
		if (!number) return;
		await env.STATE.put("lastDailyCount", number.toString())
		let message = "Daily report placeholder";
		if (lastDailyCount) {
			message = `Today, we went from ${numberToString(lastDailyCount)} \
(${lastDailyCount}) to ${numberToString(number)} (${number}). That's a total \
of +${number - lastDailyCount}.`
		}
		await client.chat.postMessage({
			channel: env.CHANNEL,
			text: message,
		});
	},

    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        const app = new SlackApp({ env })
			.message(countRegex,
				async ({ payload: message }) => {
					if (message.channel != env.CHANNEL) return;
					if (message.thread_ts || message.subtype) return;
					const match = message.text.match(countRegex);
					if (!match) return;
					const count = stringToNumber(match[1]);
					console.log("Count:", count);
					let numberText: Awaitable<string | null> = env.STATE.get("number");
					const lastCounter = env.STATE.get("lastCounter");
					if (!(await numberText)) {
						await env.STATE.put("number", "0");
						numberText = "0";
					}
					const number = parseInt(await numberText as string);
					console.log("Number:", number);
					let correct = true;
					const promises: Promise<unknown>[] = [];
					if (message.user == await lastCounter) {
						promises.push(client.chat.postEphemeral({
							channel: message.channel,
							user: message.user,
							text: "You can't count twice in a row, minion."
						}));
						correct = false;
					} else if (count != number + 1) {
						promises.push(client.chat.postEphemeral({
							channel: message.channel,
							user: message.user,
							text: `That's the wrong number, minion. It should be ${numberToString(number + 1)}.`,
						}));
						correct = false;
					}
					if (correct) {
						promises.push(env.STATE.put("number", count.toString()));
						promises.push(env.STATE.put("lastCounter", message.user));
					}
					await client.reactions.add({
						channel: message.channel,
						timestamp: message.ts,
						name: correct ? "white_check_mark" : "bangbang",
					});
					await Promise.all(promises);
				}
			);
        return await app.run(request, ctx);
    },
};