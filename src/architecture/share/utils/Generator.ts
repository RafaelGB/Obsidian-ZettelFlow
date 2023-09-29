export function generateInstanceId(len: number = 9): string {
    return Math.random()
        .toString(36)
        .slice(2, 2 + len);
}