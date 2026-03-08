type Extends<T, U extends T> = U;

export const templates = {
    welcome: "Heya, welcome! please have a read of the canvas to see \
<https://hackclub.enterprise.slack.com/docs/T0266FRGM/F0AEE6411E0|how this works> and other FAQ!",
    wrong: "thats the wrong number my little hack clubber. It should be {{correction}}.",
    twice: "you cant count twice in a row. pls wait. :waiting-pigeon:",
    dailyTmw: "Daily report coming tomorrow :yayayayayay:",
    daily: "Today, we went from {{lastDailyCountString}} ({{lastDailyCount}}) to {{numberString}} \
({{number}}) for a total of +{{difference}}. At this rate, we'll reach {{goal}} in {{goalDays}} days.",
    noProgress: "No progress today :heavysob:",
    noPerm: "You don't have permissions to do that, little hacker :hack:",
    numberSet: "<@{{userId}}> set the next number to {{text}}.",
    deleted: "The latest message was deleted! Continue counting from {{next}}."
} as const satisfies Record<string, string>;

export type Templates = typeof templates;

export type TemplateParams = Extends<
    Partial<Record<keyof typeof templates, string[]>>,
    {
        wrong: ["correction"];
        daily: [
            "lastDailyCountString",
            "lastDailyCount",
            "numberString",
            "number",
            "difference",
            "goal",
            "goalDays",
        ];
        numberSet: ["userId", "text"];
        deleted: ["next"];
    }
>

export type ParamsFor<T extends keyof Templates> =
    TemplateParams extends { [K in T]: string[] }
        ? {
            [K in TemplateParams[T][number]]: string | number
        }
        : Record<string, never>