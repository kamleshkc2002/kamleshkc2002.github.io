import {
    cleanAirport,
    clamp,
    escapeAttribute,
    escapeHtml,
    formatFareClass,
    formatMoney,
    formatStops,
    isFiniteNumber,
    isPm,
    sameText
} from "./utils.js";

export function withEvaluation(candidate, state) {
    return {
        candidate: candidate,
        evaluation: evaluateCandidate(candidate, state)
    };
}

export function evaluateCandidate(candidate, state) {
    var plan = state.currentPlan;
    var maxStops = getProfileMaxStops(plan);
    var benchmark = getSkyTeamBenchmark(state, candidate.id);
    var price = Number(candidate.price || 0);
    var stops = Number(candidate.stops || 0);
    var isSkyTeam = candidate.airlineType === "skyteam";
    var isFrontier = candidate.airlineType === "frontier" || /frontier/i.test(candidate.airline || "");
    var isBasic = candidate.fareClass === "basic";
    var originMatches = cleanAirport(candidate.origin || plan.origin || "BOS") === cleanAirport(plan.origin || "BOS");
    var destinationMatches = !plan.destination || !candidate.destination || sameText(plan.destination, candidate.destination);
    var failures = [];
    var positives = [];
    var warnings = [];
    var category = "compare";
    var label = "Compare";
    var score = 70;

    if (!originMatches) {
        failures.push("Different origin");
    }

    if (!destinationMatches) {
        failures.push("Different destination");
    }

    if (plan.excludeBasic && isBasic) {
        failures.push("Basic economy blocked");
    }

    if (isFrontier) {
        failures.push("Frontier excluded");
    }

    if (stops > maxStops) {
        failures.push(formatStops(stops) + " exceeds " + formatStops(maxStops));
    }

    if (failures.length) {
        return {
            category: "blocked",
            label: "Blocked",
            score: Math.max(0, 35 - failures.length * 10),
            failures: failures,
            positives: positives,
            warnings: warnings
        };
    }

    if (price > 0) {
        positives.push("Priced at " + formatMoney(price));
    } else {
        score -= 20;
        warnings.push("Missing fare");
    }

    if (plan.branch === "preferred" && plan.preferSkyTeam) {
        if (isSkyTeam) {
            score += 14;
            positives.push("SkyTeam match");
        } else {
            score -= 8;
            warnings.push("Not SkyTeam");
        }
    }

    if (plan.branch === "alternate") {
        if (!isSkyTeam) {
            score += 8;
            positives.push("Non-SkyTeam alternate");
        } else {
            score -= 4;
            warnings.push("SkyTeam is not an alternate");
        }

        if (benchmark && price > 0) {
            if (price < Number(benchmark.price)) {
                score += Math.min(18, 10 + Math.round((Number(benchmark.price) - price) / 25));
                positives.push("Beats SkyTeam by " + formatMoney(Number(benchmark.price) - price));
            } else {
                score -= 10;
                warnings.push("Not below SkyTeam benchmark");
            }
        } else {
            score -= 6;
            warnings.push("Add a SkyTeam benchmark");
        }
    }

    if (plan.pmDepart && candidate.departTime) {
        if (isPm(candidate.departTime)) {
            score += 8;
            positives.push("PM departure");
        } else {
            score -= 6;
            warnings.push("AM departure");
        }
    }

    if (Number(plan.budget || 0) > 0 && price > 0) {
        if (price <= Number(plan.budget)) {
            score += Math.min(16, 8 + Math.round((Number(plan.budget) - price) / 50));
            positives.push("Under target fare");
        } else {
            score -= Math.min(16, 6 + Math.round((price - Number(plan.budget)) / 50));
            warnings.push("Over target fare");
        }
    }

    if (stops === 0) {
        score += 8;
        positives.push("Nonstop");
    } else {
        score += Math.max(0, 5 - stops * 2);
        positives.push("Within stop limit");
    }

    if (candidate.fareClass === "comfort" || candidate.fareClass === "premium") {
        score += 5;
        positives.push(formatFareClass(candidate.fareClass));
    } else if (candidate.fareClass === "main") {
        score += 3;
        positives.push("Main cabin");
    } else if (candidate.fareClass === "basic") {
        score -= 5;
        warnings.push("Basic economy tradeoff");
    }

    score = clamp(Math.round(score), 0, 100);

    if (plan.branch === "alternate" && !isSkyTeam && score >= 70) {
        category = "alternate";
        label = "Alternate";
    } else if (score >= 82) {
        category = "preferred";
        label = "Best fit";
    }

    return {
        category: category,
        label: label,
        score: score,
        failures: failures,
        positives: positives,
        warnings: warnings
    };
}

export function getSkyTeamBenchmark(state, excludeId) {
    var plan = state.currentPlan;
    var maxStops = isFiniteNumber(plan.maxStops) ? Number(plan.maxStops) : 1;

    return state.candidates
        .filter(function (candidate) {
            return candidate.id !== excludeId
                && candidate.airlineType === "skyteam"
                && Number(candidate.price || 0) > 0
                && Number(candidate.stops || 0) <= maxStops
                && (!plan.excludeBasic || candidate.fareClass !== "basic")
                && cleanAirport(candidate.origin || plan.origin || "BOS") === cleanAirport(plan.origin || "BOS");
        })
        .sort(function (a, b) {
            return Number(a.price || 0) - Number(b.price || 0);
        })[0] || null;
}

export function compareCandidates(sort) {
    return function (a, b) {
        if (a.evaluation.category === "blocked" && b.evaluation.category !== "blocked") {
            return 1;
        }

        if (b.evaluation.category === "blocked" && a.evaluation.category !== "blocked") {
            return -1;
        }

        if (sort === "price") {
            return Number(a.candidate.price || 0) - Number(b.candidate.price || 0);
        }

        if (sort === "departure") {
            return String(a.candidate.departTime || "99:99").localeCompare(String(b.candidate.departTime || "99:99"));
        }

        if (b.evaluation.score !== a.evaluation.score) {
            return b.evaluation.score - a.evaluation.score;
        }

        return Number(a.candidate.price || 0) - Number(b.candidate.price || 0);
    };
}

export function getActiveRuleDescriptions(state) {
    var plan = state.currentPlan;
    var maxStops = getProfileMaxStops(plan);
    var rules = [
        { kind: "must", label: "Start from " + cleanAirport(plan.origin || "BOS") },
        { kind: "must", label: plan.destination ? "Match " + plan.destination : "Use candidate destination" },
        { kind: "must", label: maxStops === 0 ? "Nonstop only" : formatStops(maxStops) + " or less" },
        { kind: "must", label: "Exclude Frontier" }
    ];

    if (plan.excludeBasic) {
        rules.push({ kind: "must", label: "Block basic economy" });
    }

    if (plan.branch === "preferred" && plan.preferSkyTeam) {
        rules.push({ kind: "soft", points: 14, label: "Prefer SkyTeam" });
    }

    if (plan.branch === "alternate") {
        rules.push({ kind: "soft", points: 18, label: "Reward fares below SkyTeam benchmark" });
        rules.push({ kind: "soft", points: 8, label: "Reward non-SkyTeam alternates" });
    }

    if (Number(plan.budget || 0) > 0) {
        rules.push({ kind: "soft", points: 16, label: "Reward fares under " + formatMoney(plan.budget) });
    }

    if (plan.pmDepart) {
        rules.push({ kind: "soft", points: 8, label: "Prefer PM departures" });
    }

    rules.push({ kind: "soft", points: 8, label: "Reward nonstop flights" });
    return rules;
}

export function getProfileMaxStops(plan) {
    if (plan.branch === "alternate") {
        return 0;
    }

    return isFiniteNumber(plan.maxStops) ? Number(plan.maxStops) : 1;
}

export function getEvaluationSummary(evaluation) {
    if (evaluation.failures && evaluation.failures.length) {
        return "Blocked: " + evaluation.failures.join(", ");
    }

    var parts = (evaluation.positives || []).slice(0, 3);
    if (evaluation.warnings && evaluation.warnings.length) {
        parts = parts.concat(evaluation.warnings.slice(0, 2));
    }

    return parts.length ? parts.join(", ") : "Matches the active rules";
}

export function renderRuleResults(evaluation, limit) {
    var items = [];

    (evaluation.failures || []).forEach(function (text) {
        items.push({ type: "fail", icon: "fa-times", text: text });
    });

    (evaluation.positives || []).forEach(function (text) {
        items.push({ type: "pass", icon: "fa-check", text: text });
    });

    (evaluation.warnings || []).forEach(function (text) {
        items.push({ type: "warn", icon: "fa-minus", text: text });
    });

    if (!items.length) {
        return "";
    }

    return "<ul class=\"rule-result-list\">" + items.slice(0, limit).map(function (item) {
        return [
            "<li class=\"rule-result-" + escapeAttribute(item.type) + "\">",
            "<i class=\"fa " + escapeAttribute(item.icon) + "\" aria-hidden=\"true\"></i>",
            "<span>" + escapeHtml(item.text) + "</span>",
            "</li>"
        ].join("");
    }).join("") + "</ul>";
}
