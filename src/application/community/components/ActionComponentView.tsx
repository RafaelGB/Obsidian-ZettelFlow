import { CommunityAction } from "config";
import React from "react";

export function InstalledActionDetail({
  action,
  onBack,
}: {
  action: CommunityAction;
  onBack: () => void;
}) {
  return (
    <div>
      <button onClick={onBack}>← Back</button>
      <h2>{action.title}</h2>
      <p>({action.type})</p>
      <p>
        <strong>Description:</strong> {action.description}
      </p>
      <p>
        <strong>Author:</strong> {action.author}
      </p>
      <p>
        <strong>Downloads:</strong> {action.downloads}
      </p>
      <p>
        <strong>Has UI:</strong> {action.hasUI ? "Yes" : "No"}
      </p>
      {/* Puedes mostrar más info dinámica si tu Action tiene otras propiedades */}
    </div>
  );
}
