export const ENTITY_VIEW_CONFIG = {
  persone: {
    type: "PERSON",
    singular: "Persona",
    plural: "Persone",
    route: "/persone",
  },
  navi: {
    type: "VESSEL",
    singular: "Nave",
    plural: "Navi",
    route: "/navi",
  },
  enti: {
    type: "ORGANIZATION",
    singular: "Ente",
    plural: "Enti",
    route: "/enti",
  },
  luoghi: {
    type: "LOCATION",
    singular: "Luogo",
    plural: "Luoghi",
    route: "/luoghi",
  },
};

export function entityConfigFromSlug(slug) {
  return ENTITY_VIEW_CONFIG[slug] || null;
}
