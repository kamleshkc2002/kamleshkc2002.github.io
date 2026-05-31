import { defaultState } from "./state.js";
import { renderNotificationState } from "./notifications.js";
import {
    compareCandidates,
    getActiveRuleDescriptions,
    getEvaluationSummary,
    getSkyTeamBenchmark,
    renderRuleResults,
    withEvaluation
} from "./rules.js";
import {
    escapeAttribute,
    escapeHtml,
    formatDateTime,
    formatDepart,
    formatFareClass,
    formatMoney,
    formatProvider,
    formatStops,
    getDiscoveryApiBase,
    getTravelWindowText,
    shortAirline,
    tagHtml
} from "./utils.js";

export function renderAll(app) {
    renderBranchRules(app);
    renderStatusStrip(app);
    renderDiscoveryStatus(app);
    renderRecommendation(app);
    renderCandidates(app);
    renderAlerts(app);
    renderSavedPlans(app);
    renderNotificationState(app);
}

export function renderBranchRules(app) {
    app.els.branchRules.innerHTML = getActiveRuleDescriptions(app.state).map(function (rule) {
        var rulePrefix = rule.kind === "must" ? "Must" : "+" + rule.points;
        return [
            "<div class=\"rule-pill rule-pill-" + escapeAttribute(rule.kind) + "\" aria-label=\"" + escapeAttribute(rulePrefix + ": " + rule.label) + "\">",
            "<span class=\"rule-kind\">" + escapeHtml(rulePrefix) + "</span>",
            "<span>" + escapeHtml(rule.label) + "</span>",
            "</div>"
        ].join("");
    }).join("");
}

export function renderStatusStrip(app) {
    var plan = app.state.currentPlan;
    var destination = plan.destination || "destination";
    var collected = app.state.candidates.length;
    var benchmark = getSkyTeamBenchmark(app.state);

    app.els.routeSummary.textContent = (plan.origin || "BOS") + " to " + destination;
    app.els.windowSummary.textContent = getTravelWindowText(plan);
    app.els.benchmarkSummary.textContent = benchmark ? formatMoney(benchmark.price) + " " + shortAirline(benchmark.airline) : "Add SkyTeam fare";
    app.els.optionSummary.textContent = collected + " collected";
}

export function renderDiscoveryStatus(app) {
    var apiBase = getDiscoveryApiBase();
    var discovery = app.state.discovery || defaultState().discovery;
    var message = discovery.lastStatus;
    var kind = discovery.lastKind || "idle";

    if (app.discoveryInFlight) {
        message = "Searching flight sources...";
        kind = "busy";
    } else if (!message) {
        message = apiBase ? "Search API ready" : "Search API not configured";
        kind = apiBase ? "ready" : "blocked";
    }

    app.els.discoveryStatus.className = "discovery-status discovery-status-" + kind;
    app.els.discoveryStatus.textContent = message;
    app.els.discoverFlights.disabled = app.discoveryInFlight || !apiBase;
    app.els.discoveryProvider.textContent = discovery.provider ? formatProvider(discovery.provider) : (apiBase ? "Mock/local API" : "Not configured");
}

export function renderRecommendation(app) {
    if (!app.state.candidates.length) {
        app.els.recommendationBoard.innerHTML = "<div class=\"empty-recommendation\"><i class=\"fa fa-search\" aria-hidden=\"true\"></i>Collect an option to build the recommendation.</div>";
        return;
    }

    var best = app.state.candidates
        .map(function (candidate) {
            return withEvaluation(candidate, app.state);
        })
        .filter(function (item) {
            return item.evaluation.category !== "blocked";
        })
        .sort(compareCandidates("score"))[0];

    if (!best) {
        app.els.recommendationBoard.innerHTML = "<div class=\"empty-recommendation\"><i class=\"fa fa-ban\" aria-hidden=\"true\"></i>No collected options pass the active rules yet.</div>";
        return;
    }

    var evaluation = best.evaluation;
    var candidate = best.candidate;
    var summary = getEvaluationSummary(evaluation);

    app.els.recommendationBoard.innerHTML = [
        "<div class=\"best-candidate\">",
        "<div>",
        "<h3>" + escapeHtml(candidate.airline || "Flight option") + " to " + escapeHtml(candidate.destination || app.state.currentPlan.destination || "destination") + "</h3>",
        "<div class=\"best-meta\">",
        tagHtml(evaluation.category, evaluation.label),
        tagHtml("neutral", formatStops(candidate.stops)),
        tagHtml("neutral", formatDepart(candidate.departTime)),
        "</div>",
        "<p class=\"candidate-notes\">" + escapeHtml(summary) + "</p>",
        renderRuleResults(evaluation, 4),
        "</div>",
        "<div class=\"best-score\"><strong>" + evaluation.score + "</strong><span>Fit</span></div>",
        "</div>"
    ].join("");
}

export function renderCandidates(app) {
    var filter = app.els.candidateFilter.value;
    var sort = app.els.candidateSort.value;
    var candidates = app.state.candidates
        .map(function (candidate) {
            return withEvaluation(candidate, app.state);
        })
        .filter(function (item) {
            return filter === "all" || item.evaluation.category === filter;
        })
        .sort(compareCandidates(sort));

    if (!candidates.length) {
        app.els.candidateList.innerHTML = "<div class=\"empty-list\">No collected options in this view.</div>";
        return;
    }

    app.els.candidateList.innerHTML = candidates.map(function (item) {
        return renderCandidateItem(item, app);
    }).join("");
}

export function renderCandidateItem(item, app) {
    var candidate = item.candidate;
    var evaluation = item.evaluation;
    var details = [
        escapeHtml(candidate.origin || app.state.currentPlan.origin || "BOS") + " to " + escapeHtml(candidate.destination || app.state.currentPlan.destination || "destination"),
        formatStops(candidate.stops),
        formatFareClass(candidate.fareClass),
        "Depart " + formatDepart(candidate.departTime),
        "Return " + formatDepart(candidate.returnTime)
    ];
    if (candidate.sourceProvider) {
        details.push(formatProvider(candidate.sourceProvider));
    }
    var notes = candidate.notes ? "<div class=\"candidate-notes\">" + escapeHtml(candidate.notes) + "</div>" : "";
    var link = candidate.link
        ? "<a class=\"icon-button\" href=\"" + escapeAttribute(candidate.link) + "\" target=\"_blank\" rel=\"noopener\" title=\"Open fare\" aria-label=\"Open fare\"><i class=\"fa fa-external-link\" aria-hidden=\"true\"></i></a>"
        : "";

    return [
        "<article class=\"candidate-item\">",
        "<div class=\"candidate-main\">",
        "<div class=\"candidate-title-row\">",
        "<h3>" + escapeHtml(candidate.airline || "Flight option") + "</h3>",
        tagHtml(evaluation.category, evaluation.label),
        "</div>",
        "<div class=\"candidate-meta\">" + details.map(function (detail) {
            return "<span>" + detail + "</span>";
        }).join("") + "</div>",
        notes,
        renderRuleResults(evaluation, 3),
        "</div>",
        "<div class=\"candidate-controls\">",
        "<div class=\"candidate-price\">" + formatMoney(candidate.price) + "</div>",
        "<div class=\"candidate-button-row\">",
        link,
        "<button class=\"icon-button\" type=\"button\" data-action=\"watch\" data-id=\"" + escapeAttribute(candidate.id) + "\" title=\"Create fare alert\" aria-label=\"Create fare alert\"><i class=\"fa fa-bell-o\" aria-hidden=\"true\"></i></button>",
        "<button class=\"icon-button\" type=\"button\" data-action=\"delete\" data-id=\"" + escapeAttribute(candidate.id) + "\" title=\"Delete candidate\" aria-label=\"Delete candidate\"><i class=\"fa fa-trash-o\" aria-hidden=\"true\"></i></button>",
        "</div>",
        "</div>",
        "</article>"
    ].join("");
}

export function renderAlerts(app) {
    var activeAlerts = app.state.alerts.filter(function (alert) {
        return alert.active !== false;
    });

    if (!activeAlerts.length) {
        app.els.alertList.innerHTML = "<div class=\"empty-list\">No active alerts.</div>";
        return;
    }

    app.els.alertList.innerHTML = activeAlerts.map(function (alert) {
        var priceText = alert.targetPrice ? "Target " + formatMoney(alert.targetPrice) : "No fare target";
        var dateText = alert.dueAt ? "Check by " + formatDateTime(alert.dueAt) : "No due date";

        return [
            "<article class=\"side-item\">",
            "<h3>" + escapeHtml(alert.name || "Fare alert") + "</h3>",
            "<p>" + escapeHtml(priceText + " \u00b7 " + dateText) + "</p>",
            "<div class=\"side-actions\">",
            "<button class=\"planner-button planner-button-subtle\" type=\"button\" data-action=\"done\" data-id=\"" + escapeAttribute(alert.id) + "\"><i class=\"fa fa-check\" aria-hidden=\"true\"></i><span>Done</span></button>",
            "<button class=\"planner-button planner-button-subtle\" type=\"button\" data-action=\"snooze\" data-id=\"" + escapeAttribute(alert.id) + "\"><i class=\"fa fa-clock-o\" aria-hidden=\"true\"></i><span>Snooze</span></button>",
            "<button class=\"planner-button planner-button-subtle\" type=\"button\" data-action=\"delete\" data-id=\"" + escapeAttribute(alert.id) + "\"><i class=\"fa fa-trash-o\" aria-hidden=\"true\"></i><span>Delete</span></button>",
            "</div>",
            "</article>"
        ].join("");
    }).join("");
}

export function renderSavedPlans(app) {
    if (!app.state.savedPlans.length) {
        app.els.savedPlansList.innerHTML = "<div class=\"empty-list\">No saved plans.</div>";
        return;
    }

    app.els.savedPlansList.innerHTML = app.state.savedPlans
        .slice()
        .sort(function (a, b) {
            return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
        })
        .map(function (plan) {
            var title = plan.name || plan.destination || "Vacation plan";
            var details = [
                plan.origin || "BOS",
                plan.destination || "destination",
                plan.savedAt ? "Saved " + formatDateTime(plan.savedAt) : "Saved"
            ].join(" \u00b7 ");

            return [
                "<article class=\"side-item\">",
                "<h3>" + escapeHtml(title) + "</h3>",
                "<p>" + escapeHtml(details) + "</p>",
                "<div class=\"side-actions\">",
                "<button class=\"planner-button planner-button-subtle\" type=\"button\" data-action=\"load\" data-id=\"" + escapeAttribute(plan.id) + "\"><i class=\"fa fa-folder-open-o\" aria-hidden=\"true\"></i><span>Load</span></button>",
                "<button class=\"planner-button planner-button-subtle\" type=\"button\" data-action=\"delete\" data-id=\"" + escapeAttribute(plan.id) + "\"><i class=\"fa fa-trash-o\" aria-hidden=\"true\"></i><span>Delete</span></button>",
                "</div>",
                "</article>"
            ].join("");
        }).join("");
}
