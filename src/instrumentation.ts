export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        console.log('Logging support enabled for Node.js runtime');
    }
}
