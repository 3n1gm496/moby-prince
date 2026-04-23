export const ENTITY_VIEW_CONFIG = {
  persone: {
    type: "PERSON",
    singular: "Persona",
    plural: "Persone",
    route: "/entita?tab=persone",
    profileRoute: "/entita/persone",
  },
  navi: {
    type: "VESSEL",
    singular: "Nave",
    plural: "Navi",
    route: "/entita?tab=navi",
    profileRoute: "/entita/navi",
  },
  enti: {
    type: "ORGANIZATION",
    singular: "Ente",
    plural: "Enti",
    route: "/entita?tab=enti",
    profileRoute: "/entita/enti",
  },
  luoghi: {
    type: "LOCATION",
    singular: "Luogo",
    plural: "Luoghi",
    route: "/entita?tab=luoghi",
    profileRoute: "/entita/luoghi",
  },
};

export function entityConfigFromSlug(slug) {
  return ENTITY_VIEW_CONFIG[slug] || null;
}

export function entityConfigFromType(type) {
  return Object.values(ENTITY_VIEW_CONFIG).find((config) => config.type === type) || null;
}
