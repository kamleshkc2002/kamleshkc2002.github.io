import { defaultState } from "./state.js";
import { getProfileMaxStops } from "./rules.js";
import {
    addDays,
    cleanAirport,
    createId,
    getDiscoveryApiBase,
    normalizeAirlineType,
    normalizeFareClass,
    normalizeTime,
    parseLocalDate,
    toDateInputValue
} from "./utils.js";

export function discoverFlights(app, event) {
    event.preventDefault();
    app.readPlannerForm();

    var apiBase = getDiscoveryApiBase();
    var request = buildFlightSearchRequest(app);

    if (!apiBase) {
        setDiscoveryStatus(app, "blocked", "Search API not configured");
        return;
    }

    if (!request) {
        setDiscoveryStatus(app, "blocked", "Add a destination and travel date first");
        return;
    }

    app.discoveryInFlight = true;
    app.renderDiscoveryStatus();

    window.fetch(apiBase + "/api/search/flights", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
    })
        .then(function (response) {
            return response.json().catch(function () {
                return {};
            }).then(function (body) {
                if (!response.ok) {
                    throw new Error(getDiscoveryError(body, response.status));
                }
                return body;
            });
        })
        .then(function (body) {
            var result = mergeDiscoveredCandidates(app, body.candidates || []);
            var cacheText = body.cache && body.cache.hit ? "cache hit" : "fresh search";
            var countText = result.added + " added" + (result.updated ? ", " + result.updated + " updated" : "");

            app.state.discovery = {
                lastStatus: "Search complete: " + countText + " (" + cacheText + ")",
                lastKind: "success",
                lastRunAt: new Date().toISOString(),
                lastCacheHit: Boolean(body.cache && body.cache.hit),
                lastCount: Array.isArray(body.candidates) ? body.candidates.length : 0,
                provider: body.provider || ""
            };

            app.renderAll();
            app.persistSoon();
            app.checkAlerts(false);
        })
        .catch(function (error) {
            setDiscoveryStatus(app, "error", error.message || "Search failed");
        })
        .finally(function () {
            app.discoveryInFlight = false;
            app.renderDiscoveryStatus();
        });
}

export function buildFlightSearchRequest(app) {
    var plan = app.state.currentPlan;
    var windowDates = getTravelWindowDates(plan);

    if (!plan.destination || !windowDates) {
        return null;
    }

    return {
        origin: cleanAirport(plan.origin || "BOS"),
        destination: cleanAirport(plan.destination),
        travelWindow: windowDates,
        passengers: Number(plan.passengers || 1),
        budget: Number(plan.budget || 0) || undefined,
        tripStyle: plan.tripStyle,
        rules: {
            branch: plan.branch || "preferred",
            preferSkyTeam: Boolean(plan.preferSkyTeam),
            excludeBasic: Boolean(plan.excludeBasic),
            maxStops: getProfileMaxStops(plan),
            pmDepart: Boolean(plan.pmDepart)
        }
    };
}

export function getTravelWindowDates(plan) {
    var start = parseLocalDate(plan.anchorDate);

    if (!start) {
        return null;
    }

    if (plan.tripStyle === "custom") {
        var customEnd = parseLocalDate(plan.returnDate);
        return {
            startDate: toDateInputValue(start),
            endDate: customEnd ? toDateInputValue(customEnd) : undefined
        };
    }

    return {
        startDate: toDateInputValue(addDays(start, -1)),
        endDate: toDateInputValue(addDays(start, plan.tripStyle === "long_weekend_plus_one" ? 4 : 3))
    };
}

export function mergeDiscoveredCandidates(app, candidates) {
    var result = { added: 0, updated: 0 };
    var indexByKey = {};

    app.state.candidates.forEach(function (candidate, index) {
        indexByKey[getCandidateDedupeKey(app, candidate)] = index;
    });

    candidates.forEach(function (rawCandidate) {
        var candidate = normalizeDiscoveredCandidate(app, rawCandidate);
        var key = getCandidateDedupeKey(app, candidate);
        var existingIndex = indexByKey[key];

        if (existingIndex != null) {
            app.state.candidates[existingIndex] = Object.assign({}, app.state.candidates[existingIndex], candidate, {
                id: app.state.candidates[existingIndex].id
            });
            result.updated += 1;
            return;
        }

        app.state.candidates.push(candidate);
        indexByKey[key] = app.state.candidates.length - 1;
        result.added += 1;
    });

    return result;
}

export function normalizeDiscoveredCandidate(app, candidate) {
    var sourceProvider = String(candidate.sourceProvider || "mock");
    var sourceId = String(candidate.sourceId || candidate.id || "");

    return {
        id: String(candidate.id || sourceId || createId()),
        airline: String(candidate.airline || "Flight option"),
        airlineType: normalizeAirlineType(candidate.airlineType, candidate.airline),
        price: Number(candidate.price || 0),
        stops: Number(candidate.stops || 0),
        fareClass: normalizeFareClass(candidate.fareClass),
        departTime: normalizeTime(candidate.departTime),
        returnTime: normalizeTime(candidate.returnTime),
        link: String(candidate.link || ""),
        notes: String(candidate.notes || ""),
        origin: cleanAirport(candidate.origin || app.state.currentPlan.origin || "BOS"),
        destination: String(candidate.destination || app.state.currentPlan.destination || ""),
        createdAt: String(candidate.createdAt || new Date().toISOString()),
        sourceProvider: sourceProvider,
        sourceId: sourceId || sourceProvider + ":" + createId(),
        fetchedAt: String(candidate.fetchedAt || new Date().toISOString())
    };
}

export function getCandidateDedupeKey(app, candidate) {
    if (candidate.sourceProvider && candidate.sourceId) {
        return [candidate.sourceProvider, candidate.sourceId].join(":");
    }

    return [
        cleanAirport(candidate.origin || app.state.currentPlan.origin || "BOS"),
        String(candidate.destination || app.state.currentPlan.destination || "").toLowerCase(),
        String(candidate.airline || "").toLowerCase(),
        String(candidate.departTime || ""),
        String(candidate.returnTime || ""),
        String(candidate.price || "")
    ].join("|");
}

export function setDiscoveryStatus(app, kind, message) {
    app.state.discovery = Object.assign({}, app.state.discovery || defaultState().discovery, {
        lastStatus: message,
        lastKind: kind,
        lastRunAt: new Date().toISOString()
    });
    app.renderDiscoveryStatus();
    app.persistSoon();
}

export function clearDiscoveryStatus(app) {
    if (!app.state.discovery || !app.state.discovery.lastStatus) {
        return;
    }

    app.state.discovery = Object.assign({}, app.state.discovery, {
        lastStatus: "",
        lastKind: "idle",
        lastCacheHit: false,
        lastCount: 0
    });
}

export function getDiscoveryError(body, status) {
    if (body && body.code === "RATE_LIMITED") {
        return withRetryText("Too many searches from this browser. Please wait a bit and try again.", body.retryAfterSeconds);
    }

    if (body && body.code === "PROVIDER_DAILY_LIMIT_REACHED") {
        return withRetryText("The daily flight-search quota has been reached. Try again tomorrow.", body.retryAfterSeconds);
    }

    if (body && body.code === "GUARDRAILS_UNAVAILABLE") {
        return "Search is temporarily unavailable because quota guardrails are not configured.";
    }

    if (body && body.code === "PROVIDER_BAD_AIRPORT") {
        return "Use a 3-letter destination airport code like LAX, JFK, or CDG.";
    }

    if (body && body.code === "PROVIDER_CREDENTIALS_MISSING") {
        return "Flight provider credentials are not configured yet.";
    }

    if (body && body.code === "PROVIDER_AUTH_FAILED") {
        return "Flight provider authorization failed. Check the provider credentials and try again.";
    }

    if (body && body.code === "PROVIDER_UNAVAILABLE") {
        return "The flight provider is temporarily unavailable. Try again later.";
    }

    if (body && body.error) {
        if (Array.isArray(body.details) && body.details.length) {
            return body.error + " " + body.details.join(" ");
        }

        return body.error;
    }

    return "Search failed with status " + status;
}

export function withRetryText(message, retryAfterSeconds) {
    var seconds = Number(retryAfterSeconds || 0);

    if (!seconds) {
        return message;
    }

    if (seconds < 120) {
        return message + " Retry in about " + Math.ceil(seconds) + " seconds.";
    }

    return message + " Retry in about " + Math.ceil(seconds / 60) + " minutes.";
}
