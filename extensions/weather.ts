/**
 * 示例扩展：天气
 *
 * 放在 extensions/ 目录下，启动时自动加载。
 * 演示如何为 Agent 添加新工具，不改核心代码。
 */

import { Type } from "typebox";

export const name = "weather";

export const tools = [
  {
    name: "get_weather",
    description:
      "查询指定城市的当前天气。当用户询问天气时使用。返回温度、天气状况、湿度等信息。",
    parameters: Type.Object({
      city: Type.String({
        description: "城市名称，如 Beijing、Shanghai、Tokyo",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: { city: string },
      _signal: AbortSignal
    ) {
      // 模拟天气数据（实际项目接天气 API）
      const mockData: Record<string, string> = {
        beijing: "北京：晴，22°C，湿度 35%，北风 3 级",
        shanghai: "上海：多云，26°C，湿度 65%，东南风 2 级",
        tokyo: "东京：小雨，19°C，湿度 80%，东北风 4 级",
        shenzhen: "深圳：阵雨，28°C，湿度 85%，南风 3 级",
      };

      const key = params.city.toLowerCase();
      const weather = mockData[key] || `${params.city}：晴，20°C，湿度 50%（模拟数据）`;

      return {
        content: [{ type: "text" as const, text: weather }],
        details: {},
      };
    },
  },
];

// 扩展也可以注册斜杠命令（CLI 命令，不暴露给 LLM）
export const commands = [
  {
    name: "weather",
    description: "快速查天气 /weather <城市>",
    handler: async (args: string) => {
      const city = args.trim() || "Beijing";
      const mockData: Record<string, string> = {
        beijing: "北京：晴，22°C",
        shanghai: "上海：多云，26°C",
        tokyo: "东京：小雨，19°C",
      };
      return mockData[city.toLowerCase()] || `${city}：晴，20°C（模拟）`;
    },
  },
];
