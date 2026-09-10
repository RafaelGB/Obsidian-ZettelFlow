/** All plugin-data writers share one queue. Each caller receives its own actual acknowledgement. */
export class SerializedSettingsWriter {
    private tail: Promise<void> = Promise.resolve();
    constructor(private readonly write: (snapshot: unknown) => Promise<void>) {}
    save(value: unknown): Promise<void> {
        const snapshot: unknown = JSON.parse(JSON.stringify(value));
        const result = this.tail.then(() => this.write(snapshot));
        this.tail = result.catch(() => { /* Only recover the queue; result still rejects for its caller. */ });
        return result;
    }
}