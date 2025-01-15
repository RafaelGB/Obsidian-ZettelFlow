import React from "react";
import { CommunityStepSettings } from "config";

// Componente que muestra el detalle de un Step
export function InstalledStepDetail({
  step,
  onBack,
}: {
  step: CommunityStepSettings;
  onBack: () => void;
}) {
  return (
    <div>
      <button onClick={onBack}>← Back</button>
      <h2>{step.label}</h2>
      <p>({step.type})</p>
      <p>
        <strong>Description:</strong> {step.description}
      </p>
      <p>
        <strong>Author:</strong> {step.author}
      </p>
      <p>
        <strong>Downloads:</strong> {step.downloads}
      </p>
      <p>
        <strong>Root:</strong> {step.root ? "Yes" : "No"}
      </p>
      {step.targetFolder && (
        <p>
          <strong>Target Folder:</strong> {step.targetFolder}
        </p>
      )}
      {step.childrenHeader && (
        <p>
          <strong>Children Header:</strong> {step.childrenHeader}
        </p>
      )}
      <p>
        <strong>Optional:</strong> {step.optional ? "Yes" : "No"}
      </p>
      {/* Mostrar subactions si existieran */}
      {step.actions?.length > 0 && (
        <>
          <h3>Sub-Actions:</h3>
          <ul>
            {step.actions.map((action) => (
              <li key={action.id}>
                <strong>{action.type}</strong> - {action.description}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
