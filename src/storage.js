export function createStorage(indexedDB = globalThis.indexedDB) {
    const memory = new Map();
    let database;
    const state = { persistent: !!indexedDB, warning: "" };
    const open = () => database ||= new Promise((resolve, reject) => {
        if (!indexedDB) { reject(new Error("IndexedDB 不可用")); return; }
        const req = indexedDB.open("lore-wiki-lookup-v1", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("records");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    const run = async (mode, key, value) => {
        try {
            const db = await open();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction("records", mode === "get" ? "readonly" : "readwrite");
                const store = tx.objectStore("records");
                const req = mode === "get" ? store.get(key) : store.put(value, key);
                tx.oncomplete = () => resolve(req.result);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error("存储事务中止"));
            });
        } catch {
            state.persistent = false;
            state.warning = "本地存储不可用，数据仅保留在当前页面；刷新后可能丢失。";
            if (mode === "get") return memory.get(key);
            memory.set(key, value);
        }
    };
    return { get: key => run("get", key), set: (key, value) => run("set", key, value), state };
}
