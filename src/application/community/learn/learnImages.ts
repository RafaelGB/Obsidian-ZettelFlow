import { requestUrl } from "obsidian";
import { c, log } from "architecture";
import { COMMUNITY_BASE_URL } from "../services/CommunityHttpClientService";
import { previewBlobType } from "../systemPreview";
import { isSafeImage } from "./learnCatalog";

export interface LearnImageDeps {
    /** The bytes and the type of one image. */
    fetch(url: string): Promise<{ bytes: ArrayBuffer; contentType: string | undefined }>;
    toUrl(blob: Blob): string;
    revoke(url: string): void;
}

const DEFAULT_DEPS: LearnImageDeps = {
    fetch: async (url) => {
        const response = await requestUrl({ url });
        return { bytes: response.arrayBuffer, contentType: response.headers["content-type"] };
    },
    toUrl: (blob) => URL.createObjectURL(blob),
    revoke: (url) => URL.revokeObjectURL(url),
};

/**
 * **Learn's illustrations** (#801): fetched, never linked.
 *
 * GitHub raw serves `.svg` as `text/plain`, and an `<img src>` of that shows nothing (#651), so each
 * image is fetched, typed by {@link previewBlobType} and drawn from a `blob:` URL. Only a path under
 * `docs/resources/` is ever asked for; anything else in the catalog is not requested at all. One URL
 * per path per view, and every one is let go when the view is.
 */
export class LearnImages {
    private readonly urls = new Map<string, Promise<string | null>>();
    private disposed = false;

    constructor(private readonly deps: LearnImageDeps = DEFAULT_DEPS) {}

    /** The drawable URL of a catalog image, or null for one that is off-path or did not load. */
    url(path: string): Promise<string | null> {
        if (this.disposed || !isSafeImage(path)) return Promise.resolve(null);
        const known = this.urls.get(path);
        if (known) return known;
        const url = `${COMMUNITY_BASE_URL}/${path}`;
        const loading = this.deps
            .fetch(url)
            .then(({ bytes, contentType }) => {
                if (this.disposed) return null;
                return this.deps.toUrl(new Blob([bytes], { type: previewBlobType(url, contentType) }));
            })
            .catch((error: unknown) => {
                log.debug("Learn: an illustration did not load", path, error);
                return null;
            });
        this.urls.set(path, loading);
        return loading;
    }

    /**
     * A frame for one image. It stays a quiet empty frame when the image cannot load — never a
     * broken-image icon (out of scope: illustrations offline).
     */
    frame(parent: HTMLElement, path: string, alt: string): HTMLElement {
        const frame = parent.createDiv({ cls: c("learn-figure") });
        frame.addClass("is-loading");
        void this.url(path).then((src) => {
            frame.removeClass("is-loading");
            if (!src) {
                frame.addClass("is-empty");
                return;
            }
            frame.createEl("img", { cls: c("learn-figure-img"), attr: { src, alt } });
        });
        return frame;
    }

    dispose(): void {
        this.disposed = true;
        for (const loading of this.urls.values()) void loading.then((src) => src && this.deps.revoke(src));
        this.urls.clear();
    }
}
