export async function releaseOwnedRedisLock(
    connection: any,
    lockKey: string,
    lockValue: string
): Promise<void> {
    if (!connection || !lockKey || !lockValue) return;
    await connection.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockValue
    );
}
