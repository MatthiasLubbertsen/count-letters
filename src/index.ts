import { WebClient } from "@slack/web-api";
import { env } from "cloudflare:workers";
import { SlackApp } from "slack-cloudflare-workers";
import { templates, ParamsFor, Templates, TemplateParams } from "./messages";
import { State } from "./state";

type Awaitable<T> = Promise<T> | T;

const client = new WebClient(env.SLACK_BOT_TOKEN);
const countRegex = /^\s*([a-z]+)([^a-zA-Z]|$)/;

function template<T extends keyof TemplateParams>(id: T, context: ParamsFor<T>): string
function template(id: Exclude<keyof Templates, keyof TemplateParams>): string
function template(id: keyof Templates, context?: Record<string, string | number>) {
    let template: string = templates[id];
	for (const [key, value] of Object.entries(context ?? {})) {
		template = template.replaceAll(`{{${key}}}`, value.toString());
	}
    return template;
}

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
		const state = new State(env.STATE);
		const [lastDailyCount, number] = await Promise.all([
			state.get("lastDailyCount"),
			state.get("number")
		])
		if (!number) return;
		await state.put("lastDailyCount", number)
		let message = template("dailyTmw");
		if (lastDailyCount) {
			if (number === lastDailyCount) {
				message = template("noProgress")
			} else {
				message = template("daily", {
					number,
					numberString: numberToString(number),
					lastDailyCount,
					lastDailyCountString: numberToString(lastDailyCount),
					difference: number - lastDailyCount
				})
			}
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
		const state = new State(env.STATE);
        const app = new SlackApp({ env })
			.afterAuthorize(async ({ context }) => {
				if (context.channelId !== env.CHANNEL) {
					console.log(`Ignoring channel: ${context.channelId}`);
					if (context.channelId) {
						await client.conversations.leave({
							channel: context.channelId
						});
					}
					return {};
				}
			})
			.event("member_joined_channel", async ({ payload }) => {
				await client.chat.postEphemeral({
					channel: payload.channel,
					user: payload.user,
					text: template("welcome"),
				})
			})
			.message(countRegex, async ({ payload: message }) => {
				if (message.thread_ts || message.subtype) return;
				const match = message.text.match(countRegex);
				if (!match) return;
				const count = stringToNumber(match[1]);
				console.log("Count:", count);
				let number: Awaitable<number | null> = state.get("number");
				const lastCounter = state.get("lastCounter");
				let setNumber = false;
				if (!(await number)) {
					setNumber = true;
					number = 0;
				}
				number = await number as number;
				console.log("Number:", number);
				let correct = true;
				const promises: Promise<unknown>[] = [];
				if (message.user === await lastCounter) {
					promises.push(client.chat.postEphemeral({
						channel: message.channel,
						user: message.user,
						text: template("twice")
					}));
					correct = false;
				} else if (count != number + 1) {
					promises.push(client.chat.postEphemeral({
						channel: message.channel,
						user: message.user,
						text: template("wrong", {
							correction: numberToString(number),
						}),
					}));
					correct = false;
				}
				if (correct) {;
					promises.push(state.updateObject({
						number: count,
						lastCounter: message.user,
					}));
				} else if(setNumber) {
					promises.push(state.put("number", 0));
				}
				await client.reactions.add({
					channel: message.channel,
					timestamp: message.ts,
					name: correct ? "white_check_mark" : "bangbang",
				});
				await Promise.all(promises);
			})
			.command("/set-next", async ({ payload: command }) => {
				console.log(command);
				if (!env.ADMINS.split(",").includes(command.user_id)) {
					return template("noPerm");
				}
				const text = command.text.trim();
				let number: number;
				try {
					number = stringToNumber(text);
				} catch(err) {
					return "Error decoding"
				}
				await state.updateObject({
					number: number - 1,
					lastCounter: null,
				});
				await client.chat.postMessage({
					channel: command.channel_id,
					text: template("numberSet", {
						userId: command.user_id,
						text,
					})
				});
			});
        return await app.run(request, ctx);
    },
};