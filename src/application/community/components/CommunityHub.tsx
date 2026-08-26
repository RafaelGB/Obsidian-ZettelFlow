import React, { useState } from "react";
import { c } from "architecture";
import { t } from "architecture/lang";
import { PluginComponentProps } from "../typing";
import { StaticTemplatesGallery } from "./StaticTemplatesGallery";
import { InstalledTemplatesManagement } from "./InstalledTemplatesManagement";
import { ContributeTab } from "./ContributeTab";
import { LearnTab } from "./LearnTab";

type HubTab = "browse" | "contribute" | "learn" | "installed";
type LocaleKey = Parameters<typeof t>[0];

const TABS: { id: HubTab; labelKey: LocaleKey }[] = [
  { id: "browse", labelKey: "community_hub_tab_browse" },
  { id: "contribute", labelKey: "community_hub_tab_contribute" },
  { id: "learn", labelKey: "community_hub_tab_learn" },
  { id: "installed", labelKey: "community_hub_tab_installed" },
];

/**
 * The Community Hub shell (#294 S2): a tabbed home for the static gallery. Browse and Installed host
 * the existing galleries; Contribute (S3) and Learn (S4) are participation/guides panels. All panels
 * stay mounted (hidden when inactive) so switching tabs never refetches the catalog needlessly.
 */
export function CommunityHub(props: PluginComponentProps) {
  const { plugin } = props;
  const [active, setActive] = useState<HubTab>("browse");

  const panelClass = (id: HubTab) =>
    active === id ? c("community-hub-panel") : c("community-hub-panel", "is-hidden");

  return (
    <div className={c("community-hub")}>
      <div className={c("community-hub-tabs")} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            aria-label={t(tab.labelKey)}
            className={
              active === tab.id
                ? c("community-hub-tab", "is-active")
                : c("community-hub-tab")
            }
            onClick={() => setActive(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className={panelClass("browse")}>
        <StaticTemplatesGallery plugin={plugin} />
      </div>
      <div className={panelClass("contribute")}>
        <ContributeTab plugin={plugin} />
      </div>
      <div className={panelClass("learn")}>
        <LearnTab plugin={plugin} />
      </div>
      <div className={panelClass("installed")}>
        <InstalledTemplatesManagement plugin={plugin} />
      </div>
    </div>
  );
}
