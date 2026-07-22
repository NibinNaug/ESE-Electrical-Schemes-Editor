import type { Circuit, EseProject } from "./types";

const generatedCircuitName = (name: string, reference: string): boolean => {
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^Circuit ${escaped} \\d+$`).test(name);
};

/**
 * Règle métier ESE : un repère désigne un seul circuit logique. Les différentes
 * portions visibles restent des traces séparées à l'intérieur de ce circuit.
 */
export const mergeCircuitsByReference = (input: EseProject): EseProject => {
  const project = structuredClone(input);
  const references = new Map(
    project.legendEntries.map((entry) => [entry.id, entry.reference])
  );
  const groups = new Map<string, Circuit[]>();

  for (const circuit of project.circuits) {
    const key = `${circuit.legendEntryId}\u0000${circuit.referenceOverride || ""}`;
    const group = groups.get(key);
    if (group) group.push(circuit);
    else groups.set(key, [circuit]);
  }

  project.circuits = [...groups.values()].map((group) => {
    const primary = group[0];
    const reference = primary.referenceOverride || references.get(primary.legendEntryId) || "—";
    const traces = group.flatMap((circuit) => circuit.traces);
    const name = group.every((circuit) => generatedCircuitName(circuit.name, reference))
      ? `Circuit ${reference}`
      : primary.name;
    return { ...primary, name, traces };
  });

  return project;
};
