import { STORAGE_KEY } from "./constants.js";

export function defaultState() {
    return {
        currentPlan: {
            id: null,
            tripName: "",
            destination: "",
            origin: "BOS",
            budget: "",
            tripStyle: "weekend_plus_one",
            anchorDate: "",
            returnDate: "",
            branch: "preferred",
            pmDepart: true,
            excludeBasic: true,
            preferSkyTeam: true,
            maxStops: 1,
            passengers: 1,
            tripNotes: ""
        },
        candidates: [],
        alerts: [],
        savedPlans: [],
        discovery: {
            lastStatus: "",
            lastKind: "idle",
            lastRunAt: "",
            lastCacheHit: false,
            lastCount: 0,
            provider: ""
        },
        notificationsEnabled: false,
        updatedAt: ""
    };
}

export function loadState() {
    var base = defaultState();

    try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return base;
        }

        var saved = JSON.parse(raw);
        return {
            currentPlan: Object.assign({}, base.currentPlan, saved.currentPlan || {}),
            candidates: Array.isArray(saved.candidates) ? saved.candidates : [],
            alerts: Array.isArray(saved.alerts) ? saved.alerts : [],
            savedPlans: Array.isArray(saved.savedPlans) ? saved.savedPlans : [],
            discovery: Object.assign({}, base.discovery, saved.discovery || {}),
            notificationsEnabled: Boolean(saved.notificationsEnabled),
            updatedAt: saved.updatedAt || ""
        };
    } catch (error) {
        return base;
    }
}
