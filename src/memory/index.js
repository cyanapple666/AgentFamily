/**
 * 记忆管理器
 *
 * 基于关键词的跨会话记忆检索。
 * 每次会话保存时自动建索引，对话前检索相关历史注入 System Prompt。
 */
/** 停用词 */
const STOP_WORDS = new Set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
    "没有", "看", "好", "自己", "这", "他", "她", "它", "们", "那", "些",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "and", "but", "or",
    "nor", "not", "so", "yet", "both", "either", "neither", "each", "every",
    "all", "any", "few", "more", "most", "other", "some", "such", "no",
    "only", "own", "same", "than", "too", "very", "just", "because",
    "about", "what", "which", "who", "whom", "this", "that", "these",
    "those", "it", "its", "if", "then", "else", "when", "where", "why",
    "how", "嗯", "啊", "吧", "呢", "嘛", "哦", "哈", "呀",
]);
/** 分词 */
function tokenize(text) {
    // 简单按非字母数字字符分割，保留中文字符
    const tokens = text
        .toLowerCase()
        .split(/[\s,.;:!?()\[\]{}"'`，。；：！？（）【】「」『』《》、]+/)
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
    return tokens;
}
/** TF-IDF 简版：词频 × 逆文档频率 */
function score(query, doc) {
    const qTokens = tokenize(query);
    const dTokens = tokenize(doc);
    if (qTokens.length === 0 || dTokens.length === 0)
        return 0;
    let hits = 0;
    for (const qt of qTokens) {
        if (dTokens.includes(qt))
            hits++;
    }
    // 命中率 × 命中密度
    const hitRate = hits / qTokens.length;
    const density = hits / Math.max(dTokens.length, 1);
    return hitRate * 0.7 + density * 0.3;
}
export class MemoryManager {
    entries = [];
    /** 索引一条消息 */
    index(sessionId, sessionTitle, text, timestamp) {
        this.entries.push({ sessionId, sessionTitle, text, timestamp });
    }
    /** 索引整个会话 */
    indexSession(sessionId, title, messages, timestamp) {
        const texts = [];
        for (const msg of messages) {
            if (msg.role === "user" || msg.role === "assistant") {
                const content = Array.isArray(msg.content)
                    ? msg.content
                        .filter((c) => c.type === "text")
                        .map((c) => c.text)
                        .join(" ")
                    : msg.content || "";
                if (content.trim())
                    texts.push(content.trim());
            }
        }
        if (texts.length > 0) {
            this.index(sessionId, title, texts.join(" "), timestamp);
        }
    }
    /** 搜索相关记忆，返回 topK 条 */
    search(query, topK = 3) {
        const scored = this.entries
            .map((e) => ({
            text: e.text.slice(0, 200),
            title: e.sessionTitle,
            score: score(query, e.text),
        }))
            .filter((e) => e.score > 0.05)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
        return scored;
    }
    /** 总条目数 */
    get size() {
        return this.entries.length;
    }
}
/** 全局单例 */
export const memory = new MemoryManager();
//# sourceMappingURL=index.js.map