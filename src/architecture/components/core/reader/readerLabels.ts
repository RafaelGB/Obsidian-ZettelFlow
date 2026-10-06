import type { t } from "architecture/lang";
import type { ReaderKind } from "./readerContract";

type LocaleKey = Parameters<typeof t>[0];

/** What each way through the notes is called, on the reader's title line, the chooser and the end. */
export const KIND_KEY: Record<ReaderKind, LocaleKey> = {
    around: "reader_kind_around",
    argument: "reader_kind_argument",
    story: "reader_kind_story",
    essentials: "reader_kind_essentials",
    region: "reader_kind_region",
    selection: "reader_kind_selection",
};
