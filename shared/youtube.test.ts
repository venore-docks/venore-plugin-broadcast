import { describe, expect, it } from "vitest";
import { parseYouTubeLink, youTubeEmbedUrl } from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeLink", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc123`],
    [`https://www.youtube.com/live/${ID}`],
    [`https://www.youtube.com/live/${ID}?feature=shared`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`youtu.be/${ID}`],
    [`  ${ID}  `],
  ])("extrai o id de %s", (input) => {
    expect(parseYouTubeLink(input)).toEqual({ kind: "video", videoId: ID });
  });

  it.each([
    ["https://www.youtube.com/@canal/live"],
    ["https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/live"],
    ["https://www.youtube.com/c/NomeDoCanal"],
  ])("reconhece link de canal (%s) sem inventar um id", (input) => {
    expect(parseYouTubeLink(input)).toEqual({ kind: "channel" });
  });

  it.each([
    [""],
    ["não é um link"],
    ["https://vimeo.com/123456"],
    [`https://evil.com/watch?v=${ID}`],
    [`https://www.youtube.com.evil.com/watch?v=${ID}`],
    ["https://www.youtube.com/watch?v=curto"],
    ["https://www.youtube.com/watch"],
    ["https://www.youtube.com/"],
  ])("rejeita %s", (input) => {
    expect(parseYouTubeLink(input)).toEqual({ kind: "invalid" });
  });
});

describe("youTubeEmbedUrl", () => {
  it("monta o embed a partir do id, com autoplay e som", () => {
    const url = new URL(youTubeEmbedUrl(ID));
    expect(url.origin).toBe("https://www.youtube.com");
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("mute")).toBe("0");
  });
});
