import * as z from "zod";

export const MessageValidator = z
    .object({
        code: z.number().lte(999_999_999).gte(100_000_000),
        source: z.union([
            z.literal("server"),
            z.literal("controller"),
            z.literal("voice"),
            z.literal("presenter"),
        ]),
    })
    .and(
        z.discriminatedUnion("event", [
            z.object({ event: z.literal("data"), slideNumber: z.number() }),
            z.object({ event: z.literal("create"), slideData: z.any() }),
            z.object({ event: z.literal("join") }),
            z.object({ event: z.literal("leave") }),
            z.object({
                event: z.literal("command"),
                change: z.union([z.literal("forward"), z.literal("backward")]),
            }),
            z.object({ event: z.literal("motion"), angle: z.float32() }),
        ])
    );

export type Message = z.infer<typeof MessageValidator>;
