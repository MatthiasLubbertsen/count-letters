const keyTypes = {
    number: "number",
    lastCounter: "string",
    lastDailyCount: "number",
    lastMessageTs: "string",
} as const;
type KeyTypes = typeof keyTypes;

type TypeMap = {
    number: number;
    string: string;
}

export type StateObject = {
    -readonly [K in keyof KeyTypes]: TypeMap[KeyTypes[K]] | null;
};

export class State {
    db: KVNamespace;
    private objectPromise: Promise<Partial<StateObject>> | null = null;

    constructor(db: KVNamespace) {
        this.db = db;
    }

    async getObject() {
        if (!this.objectPromise) {
            this.objectPromise = this.db
                .get<Partial<StateObject>>("state", "json")
                .then(result => result ?? {});
        }
        return this.objectPromise;
    }

    async putObject(value: Partial<StateObject>) {
        this.objectPromise = Promise.resolve(value);
        return this.db.put("state", JSON.stringify(value))
    }

    async updateObject(value: Partial<StateObject>) {
        return this.putObject({
            ...await this.getObject(),
            ...value,
        });
    }

    async get<T extends keyof StateObject>(
        key: T
    ): Promise<StateObject[T] | null> {
        const object = await this.getObject();
        return object[key] ?? null;
    }

    async put<T extends keyof StateObject>(
        key: T,
        value: StateObject[T]
    ) {
        const object = await this.getObject();
        object[key] = value;
        await this.putObject(object);
    }
}