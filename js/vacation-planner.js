(function () {
    "use strict";

    var STORAGE_KEY = "kamleshVacationPlanner.v1";
    var SAVE_DELAY = 180;
    var state = loadState();
    var saveTimer = null;

    var els = {};

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        cacheElements();
        fillPlannerForm();
        bindEvents();
        updateDateControls();
        renderAll();
        checkAlerts(true);
        window.setInterval(function () {
            checkAlerts(false);
        }, 30000);
    }

    function defaultState() {
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
                tripNotes: ""
            },
            candidates: [],
            alerts: [],
            savedPlans: [],
            notificationsEnabled: false,
            updatedAt: ""
        };
    }

    function loadState() {
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
                notificationsEnabled: Boolean(saved.notificationsEnabled),
                updatedAt: saved.updatedAt || ""
            };
        } catch (error) {
            return base;
        }
    }

    function cacheElements() {
        [
            "plannerForm",
            "tripName",
            "destination",
            "origin",
            "budget",
            "tripStyle",
            "anchorDate",
            "returnDate",
            "anchorDateLabel",
            "customReturnField",
            "pmDepart",
            "excludeBasic",
            "preferSkyTeam",
            "maxStops",
            "tripNotes",
            "branchRules",
            "savePlan",
            "saveState",
            "routeSummary",
            "windowSummary",
            "benchmarkSummary",
            "alertSummary",
            "recommendationBoard",
            "candidateForm",
            "candidateAirline",
            "candidateAirlineType",
            "candidatePrice",
            "candidateStops",
            "candidateFareClass",
            "candidateDepartTime",
            "candidateReturnTime",
            "candidateLink",
            "candidateNotes",
            "candidateFilter",
            "candidateSort",
            "candidateList",
            "clearCandidates",
            "alertForm",
            "alertName",
            "alertTarget",
            "alertDue",
            "enableNotifications",
            "testNotification",
            "notificationState",
            "alertBanner",
            "alertList",
            "savedPlansList",
            "clearSavedPlans",
            "resetCurrentPlan",
            "printPlanner",
            "exportPlanner",
            "importPlanner"
        ].forEach(function (id) {
            els[id] = document.getElementById(id);
        });
    }

    function bindEvents() {
        [
            "tripName",
            "destination",
            "origin",
            "budget",
            "tripStyle",
            "anchorDate",
            "returnDate",
            "pmDepart",
            "excludeBasic",
            "preferSkyTeam",
            "maxStops",
            "tripNotes"
        ].forEach(function (id) {
            var element = els[id];
            var eventName = element.type === "checkbox" || element.tagName === "SELECT" ? "change" : "input";
            element.addEventListener(eventName, handlePlannerChange);
        });

        Array.prototype.forEach.call(document.querySelectorAll("input[name='branch']"), function (radio) {
            radio.addEventListener("change", handlePlannerChange);
        });

        els.savePlan.addEventListener("click", saveCurrentPlan);
        els.resetCurrentPlan.addEventListener("click", resetCurrentPlan);
        els.candidateForm.addEventListener("submit", addCandidate);
        els.clearCandidates.addEventListener("click", clearCandidates);
        els.candidateFilter.addEventListener("change", renderCandidates);
        els.candidateSort.addEventListener("change", renderCandidates);
        els.candidateList.addEventListener("click", handleCandidateClick);
        els.alertForm.addEventListener("submit", addAlert);
        els.alertList.addEventListener("click", handleAlertClick);
        els.savedPlansList.addEventListener("click", handleSavedPlanClick);
        els.clearSavedPlans.addEventListener("click", clearSavedPlans);
        els.enableNotifications.addEventListener("click", enableNotifications);
        els.testNotification.addEventListener("click", testNotification);
        els.printPlanner.addEventListener("click", function () {
            window.print();
        });
        els.exportPlanner.addEventListener("click", exportPlanner);
        els.importPlanner.addEventListener("change", importPlanner);
    }

    function fillPlannerForm() {
        var plan = state.currentPlan;
        els.tripName.value = plan.tripName || "";
        els.destination.value = plan.destination || "";
        els.origin.value = plan.origin || "BOS";
        els.budget.value = plan.budget || "";
        els.tripStyle.value = plan.tripStyle || "weekend_plus_one";
        els.anchorDate.value = plan.anchorDate || "";
        els.returnDate.value = plan.returnDate || "";
        els.pmDepart.checked = Boolean(plan.pmDepart);
        els.excludeBasic.checked = Boolean(plan.excludeBasic);
        els.preferSkyTeam.checked = Boolean(plan.preferSkyTeam);
        els.maxStops.value = String(isFiniteNumber(plan.maxStops) ? plan.maxStops : 1);
        els.tripNotes.value = plan.tripNotes || "";

        var branch = plan.branch || "preferred";
        var branchInput = document.querySelector("input[name='branch'][value='" + branch + "']");
        if (branchInput) {
            branchInput.checked = true;
        }
    }

    function readPlannerForm() {
        var branchInput = document.querySelector("input[name='branch']:checked");

        state.currentPlan = Object.assign({}, state.currentPlan, {
            tripName: els.tripName.value.trim(),
            destination: els.destination.value.trim(),
            origin: cleanAirport(els.origin.value || "BOS"),
            budget: els.budget.value,
            tripStyle: els.tripStyle.value,
            anchorDate: els.anchorDate.value,
            returnDate: els.returnDate.value,
            branch: branchInput ? branchInput.value : "preferred",
            pmDepart: els.pmDepart.checked,
            excludeBasic: els.excludeBasic.checked,
            preferSkyTeam: els.preferSkyTeam.checked,
            maxStops: Number(els.maxStops.value),
            tripNotes: els.tripNotes.value.trim()
        });
    }

    function handlePlannerChange() {
        readPlannerForm();
        updateDateControls();
        renderAll();
        persistSoon();
    }

    function updateDateControls() {
        var style = state.currentPlan.tripStyle;
        var isCustom = style === "custom";

        els.customReturnField.classList.toggle("is-hidden", !isCustom);

        if (style === "long_weekend_plus_one") {
            els.anchorDateLabel.textContent = "Long weekend starts";
        } else if (isCustom) {
            els.anchorDateLabel.textContent = "Depart after";
        } else {
            els.anchorDateLabel.textContent = "Weekend starts";
        }
    }

    function renderAll() {
        renderBranchRules();
        renderStatusStrip();
        renderRecommendation();
        renderCandidates();
        renderAlerts();
        renderSavedPlans();
        renderNotificationState();
    }

    function renderBranchRules() {
        els.branchRules.innerHTML = getActiveRuleDescriptions().map(function (rule) {
            var rulePrefix = rule.kind === "must" ? "Must" : "+" + rule.points;
            return [
                "<div class=\"rule-pill rule-pill-" + escapeAttribute(rule.kind) + "\" aria-label=\"" + escapeAttribute(rulePrefix + ": " + rule.label) + "\">",
                "<span class=\"rule-kind\">" + escapeHtml(rulePrefix) + "</span>",
                "<span>" + escapeHtml(rule.label) + "</span>",
                "</div>"
            ].join("");
        }).join("");
    }

    function renderStatusStrip() {
        var plan = state.currentPlan;
        var destination = plan.destination || "destination";
        var activeAlerts = state.alerts.filter(function (alert) {
            return alert.active !== false;
        }).length;
        var benchmark = getSkyTeamBenchmark();

        els.routeSummary.textContent = (plan.origin || "BOS") + " to " + destination;
        els.windowSummary.textContent = getTravelWindowText(plan);
        els.benchmarkSummary.textContent = benchmark ? formatMoney(benchmark.price) + " " + shortAirline(benchmark.airline) : "Add SkyTeam fare";
        els.alertSummary.textContent = activeAlerts + " active";
    }

    function renderRecommendation() {
        if (!state.candidates.length) {
            els.recommendationBoard.innerHTML = "<div class=\"empty-recommendation\"><i class=\"fa fa-plane\" aria-hidden=\"true\"></i>Add a fare to build the recommendation.</div>";
            return;
        }

        var best = state.candidates
            .map(withEvaluation)
            .filter(function (item) {
                return item.evaluation.category !== "blocked";
            })
            .sort(compareCandidates("score"))[0];

        if (!best) {
            els.recommendationBoard.innerHTML = "<div class=\"empty-recommendation\"><i class=\"fa fa-ban\" aria-hidden=\"true\"></i>No usable candidates yet.</div>";
            return;
        }

        var evaluation = best.evaluation;
        var candidate = best.candidate;
        var summary = getEvaluationSummary(evaluation);

        els.recommendationBoard.innerHTML = [
            "<div class=\"best-candidate\">",
            "<div>",
            "<h3>" + escapeHtml(candidate.airline || "Flight option") + " to " + escapeHtml(candidate.destination || state.currentPlan.destination || "destination") + "</h3>",
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

    function renderCandidates() {
        var filter = els.candidateFilter.value;
        var sort = els.candidateSort.value;
        var candidates = state.candidates
            .map(withEvaluation)
            .filter(function (item) {
                return filter === "all" || item.evaluation.category === filter;
            })
            .sort(compareCandidates(sort));

        if (!candidates.length) {
            els.candidateList.innerHTML = "<div class=\"empty-list\">No candidates in this view.</div>";
            return;
        }

        els.candidateList.innerHTML = candidates.map(renderCandidateItem).join("");
    }

    function renderCandidateItem(item) {
        var candidate = item.candidate;
        var evaluation = item.evaluation;
        var details = [
            escapeHtml(candidate.origin || state.currentPlan.origin || "BOS") + " to " + escapeHtml(candidate.destination || state.currentPlan.destination || "destination"),
            formatStops(candidate.stops),
            formatFareClass(candidate.fareClass),
            "Depart " + formatDepart(candidate.departTime),
            "Return " + formatDepart(candidate.returnTime)
        ];
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

    function renderAlerts() {
        var activeAlerts = state.alerts.filter(function (alert) {
            return alert.active !== false;
        });

        if (!activeAlerts.length) {
            els.alertList.innerHTML = "<div class=\"empty-list\">No active alerts.</div>";
            els.alertSummary.textContent = "0 active";
            return;
        }

        els.alertSummary.textContent = activeAlerts.length + " active";
        els.alertList.innerHTML = activeAlerts.map(function (alert) {
            var priceText = alert.targetPrice ? "Target " + formatMoney(alert.targetPrice) : "No fare target";
            var dateText = alert.dueAt ? "Check by " + formatDateTime(alert.dueAt) : "No due date";

            return [
                "<article class=\"side-item\">",
                "<h3>" + escapeHtml(alert.name || "Fare alert") + "</h3>",
                "<p>" + escapeHtml(priceText + " · " + dateText) + "</p>",
                "<div class=\"side-actions\">",
                "<button class=\"planner-button planner-button-subtle\" type=\"button\" data-action=\"done\" data-id=\"" + escapeAttribute(alert.id) + "\"><i class=\"fa fa-check\" aria-hidden=\"true\"></i><span>Done</span></button>",
                "<button class=\"planner-button planner-button-subtle\" type=\"button\" data-action=\"snooze\" data-id=\"" + escapeAttribute(alert.id) + "\"><i class=\"fa fa-clock-o\" aria-hidden=\"true\"></i><span>Snooze</span></button>",
                "<button class=\"planner-button planner-button-subtle\" type=\"button\" data-action=\"delete\" data-id=\"" + escapeAttribute(alert.id) + "\"><i class=\"fa fa-trash-o\" aria-hidden=\"true\"></i><span>Delete</span></button>",
                "</div>",
                "</article>"
            ].join("");
        }).join("");
    }

    function renderSavedPlans() {
        if (!state.savedPlans.length) {
            els.savedPlansList.innerHTML = "<div class=\"empty-list\">No saved plans.</div>";
            return;
        }

        els.savedPlansList.innerHTML = state.savedPlans
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
                ].join(" · ");

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

    function renderNotificationState() {
        if (!("Notification" in window)) {
            els.notificationState.className = "notification-state is-blocked";
            els.notificationState.textContent = "Browser alerts unavailable";
            return;
        }

        if (Notification.permission === "denied") {
            els.notificationState.className = "notification-state is-blocked";
            els.notificationState.textContent = "Browser alerts blocked";
            return;
        }

        if (state.notificationsEnabled && Notification.permission === "granted") {
            els.notificationState.className = "notification-state is-on";
            els.notificationState.textContent = "Browser alerts on";
            return;
        }

        els.notificationState.className = "notification-state";
        els.notificationState.textContent = "Browser alerts off";
    }

    function addCandidate(event) {
        event.preventDefault();
        readPlannerForm();

        var airline = els.candidateAirline.value.trim();
        var airlineType = els.candidateAirlineType.value;

        if (/frontier/i.test(airline)) {
            airlineType = "frontier";
        }

        var candidate = {
            id: createId(),
            airline: airline || "Flight option",
            airlineType: airlineType,
            price: Number(els.candidatePrice.value || 0),
            stops: Number(els.candidateStops.value || 0),
            fareClass: els.candidateFareClass.value,
            departTime: els.candidateDepartTime.value,
            returnTime: els.candidateReturnTime.value,
            link: els.candidateLink.value.trim(),
            notes: els.candidateNotes.value.trim(),
            origin: state.currentPlan.origin || "BOS",
            destination: state.currentPlan.destination,
            createdAt: new Date().toISOString()
        };

        state.candidates.push(candidate);
        els.candidateForm.reset();
        setCandidateDefaults();
        renderAll();
        persistSoon();
        checkAlerts(false);
    }

    function setCandidateDefaults() {
        var branch = state.currentPlan.branch || "preferred";
        els.candidateAirlineType.value = branch === "alternate" ? "other" : "skyteam";
        els.candidateStops.value = branch === "alternate" ? "0" : "1";
        els.candidateFareClass.value = "main";
    }

    function clearCandidates() {
        if (!state.candidates.length) {
            return;
        }

        if (window.confirm("Clear all flight candidates for the current plan?")) {
            state.candidates = [];
            renderAll();
            persistSoon();
        }
    }

    function handleCandidateClick(event) {
        var button = event.target.closest("button[data-action]");
        if (!button) {
            return;
        }

        var id = button.getAttribute("data-id");
        var action = button.getAttribute("data-action");
        var candidate = findById(state.candidates, id);

        if (!candidate) {
            return;
        }

        if (action === "delete") {
            state.candidates = state.candidates.filter(function (item) {
                return item.id !== id;
            });
        }

        if (action === "watch") {
            state.alerts.push({
                id: createId(),
                name: "Watch " + (candidate.airline || "flight"),
                targetPrice: Math.max(0, Number(candidate.price || 0) - 25),
                dueAt: "",
                destination: candidate.destination || state.currentPlan.destination,
                active: true,
                createdAt: new Date().toISOString(),
                lastTriggeredAt: ""
            });
        }

        renderAll();
        persistSoon();
    }

    function addAlert(event) {
        event.preventDefault();

        state.alerts.push({
            id: createId(),
            name: els.alertName.value.trim() || "Fare alert",
            targetPrice: Number(els.alertTarget.value || 0),
            dueAt: els.alertDue.value,
            destination: state.currentPlan.destination,
            active: true,
            createdAt: new Date().toISOString(),
            lastTriggeredAt: ""
        });

        els.alertForm.reset();
        renderAll();
        persistSoon();
        checkAlerts(false);
    }

    function handleAlertClick(event) {
        var button = event.target.closest("button[data-action]");
        if (!button) {
            return;
        }

        var id = button.getAttribute("data-id");
        var action = button.getAttribute("data-action");
        var alert = findById(state.alerts, id);

        if (!alert) {
            return;
        }

        if (action === "done") {
            alert.active = false;
        }

        if (action === "delete") {
            state.alerts = state.alerts.filter(function (item) {
                return item.id !== id;
            });
        }

        if (action === "snooze") {
            var next = new Date();
            next.setDate(next.getDate() + 1);
            alert.dueAt = toDateTimeLocal(next);
            alert.lastTriggeredAt = "";
        }

        renderAll();
        persistSoon();
    }

    function saveCurrentPlan() {
        readPlannerForm();

        var id = state.currentPlan.id || createId();
        state.currentPlan.id = id;

        var snapshot = {
            id: id,
            name: state.currentPlan.tripName,
            origin: state.currentPlan.origin,
            destination: state.currentPlan.destination,
            savedAt: new Date().toISOString(),
            currentPlan: clone(state.currentPlan),
            candidates: clone(state.candidates),
            alerts: clone(state.alerts)
        };

        state.savedPlans = state.savedPlans.filter(function (plan) {
            return plan.id !== id;
        });
        state.savedPlans.push(snapshot);

        renderAll();
        persistNow();
    }

    function handleSavedPlanClick(event) {
        var button = event.target.closest("button[data-action]");
        if (!button) {
            return;
        }

        var id = button.getAttribute("data-id");
        var action = button.getAttribute("data-action");
        var saved = findById(state.savedPlans, id);

        if (!saved) {
            return;
        }

        if (action === "delete") {
            state.savedPlans = state.savedPlans.filter(function (plan) {
                return plan.id !== id;
            });
        }

        if (action === "load") {
            state.currentPlan = Object.assign({}, defaultState().currentPlan, saved.currentPlan || {});
            state.currentPlan.id = saved.id;
            state.candidates = clone(saved.candidates || []);
            state.alerts = clone(saved.alerts || []);
            fillPlannerForm();
            updateDateControls();
        }

        renderAll();
        persistSoon();
    }

    function clearSavedPlans() {
        if (!state.savedPlans.length) {
            return;
        }

        if (window.confirm("Clear all saved plans from this browser?")) {
            state.savedPlans = [];
            renderAll();
            persistSoon();
        }
    }

    function resetCurrentPlan() {
        if (!window.confirm("Reset the current planner form and flight candidates?")) {
            return;
        }

        state.currentPlan = defaultState().currentPlan;
        state.candidates = [];
        state.alerts = [];
        fillPlannerForm();
        setCandidateDefaults();
        updateDateControls();
        renderAll();
        persistSoon();
    }

    function enableNotifications() {
        if (!("Notification" in window)) {
            showAlertBanner("Browser alerts are unavailable here.");
            renderNotificationState();
            return;
        }

        Notification.requestPermission().then(function (permission) {
            state.notificationsEnabled = permission === "granted";
            renderNotificationState();
            persistSoon();

            if (permission === "granted") {
                sendNotification("Vacation Planner alerts enabled", "Alerts can appear while this page is open.", "planner-enabled");
            }
        });
    }

    function testNotification() {
        var title = "Vacation Planner";
        var body = "Alert test for " + (state.currentPlan.destination || "your next trip") + ".";
        sendNotification(title, body, "planner-test");
    }

    function sendNotification(title, body, tag) {
        showAlertBanner(body);

        if (!("Notification" in window)) {
            return;
        }

        if (state.notificationsEnabled && Notification.permission === "granted") {
            new Notification(title, {
                body: body,
                tag: tag
            });
        }
    }

    function checkAlerts(quiet) {
        var activeAlerts = state.alerts.filter(function (alert) {
            return alert.active !== false;
        });
        var triggered = [];
        var now = new Date();

        activeAlerts.forEach(function (alert) {
            var match = getAlertMatch(alert);
            var due = alert.dueAt ? new Date(alert.dueAt) <= now : false;

            if ((match || due) && !alertRecentlyTriggered(alert)) {
                alert.lastTriggeredAt = now.toISOString();
                triggered.push({
                    alert: alert,
                    match: match,
                    due: due
                });
            }
        });

        if (!triggered.length) {
            return;
        }

        triggered.forEach(function (item) {
            var alert = item.alert;
            var body = item.match
                ? (item.match.airline || "A fare") + " is at " + formatMoney(item.match.price) + "."
                : (alert.name || "Fare alert") + " is due.";

            if (!quiet) {
                sendNotification(alert.name || "Fare alert", body, "planner-alert-" + alert.id);
            }
        });

        renderAlerts();
        persistSoon();
    }

    function getAlertMatch(alert) {
        if (!alert.targetPrice) {
            return null;
        }

        var destination = String(alert.destination || "").toLowerCase();

        return state.candidates
            .filter(function (candidate) {
                var candidateDestination = String(candidate.destination || "").toLowerCase();
                var destinationMatches = !destination || !candidateDestination || destination === candidateDestination;
                return destinationMatches && Number(candidate.price || 0) > 0 && Number(candidate.price) <= Number(alert.targetPrice);
            })
            .sort(function (a, b) {
                return Number(a.price || 0) - Number(b.price || 0);
            })[0] || null;
    }

    function alertRecentlyTriggered(alert) {
        if (!alert.lastTriggeredAt) {
            return false;
        }

        var last = new Date(alert.lastTriggeredAt).getTime();
        return Date.now() - last < 60 * 60 * 1000;
    }

    function showAlertBanner(message) {
        els.alertBanner.textContent = message;
        els.alertBanner.classList.add("is-visible");
    }

    function exportPlanner() {
        persistNow();

        var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        var name = state.currentPlan.tripName || state.currentPlan.destination || "vacation-planner";

        link.href = url;
        link.download = slugify(name) + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function importPlanner(event) {
        var file = event.target.files[0];
        if (!file) {
            return;
        }

        var reader = new FileReader();
        reader.onload = function () {
            try {
                var imported = JSON.parse(String(reader.result || "{}"));
                var base = defaultState();
                state = {
                    currentPlan: Object.assign({}, base.currentPlan, imported.currentPlan || {}),
                    candidates: Array.isArray(imported.candidates) ? imported.candidates : [],
                    alerts: Array.isArray(imported.alerts) ? imported.alerts : [],
                    savedPlans: Array.isArray(imported.savedPlans) ? imported.savedPlans : [],
                    notificationsEnabled: Boolean(imported.notificationsEnabled),
                    updatedAt: imported.updatedAt || ""
                };
                fillPlannerForm();
                updateDateControls();
                renderAll();
                persistNow();
            } catch (error) {
                window.alert("That file could not be imported.");
            }
        };
        reader.readAsText(file);
        event.target.value = "";
    }

    function persistSoon() {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(persistNow, SAVE_DELAY);
    }

    function persistNow() {
        state.updatedAt = new Date().toISOString();

        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            updateSaveState();
        } catch (error) {
            els.saveState.innerHTML = "<i class=\"fa fa-exclamation-triangle\" aria-hidden=\"true\"></i> Local save blocked";
        }
    }

    function updateSaveState() {
        var time = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
        els.saveState.innerHTML = "<i class=\"fa fa-check-circle\" aria-hidden=\"true\"></i> Saved" + (time ? " " + escapeHtml(time) : " locally");
    }

    function withEvaluation(candidate) {
        return {
            candidate: candidate,
            evaluation: evaluateCandidate(candidate)
        };
    }

    function evaluateCandidate(candidate) {
        var plan = state.currentPlan;
        var maxStops = getProfileMaxStops(plan);
        var benchmark = getSkyTeamBenchmark(candidate.id);
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

    function getSkyTeamBenchmark(excludeId) {
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

    function compareCandidates(sort) {
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

    function getActiveRuleDescriptions() {
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

    function getProfileMaxStops(plan) {
        if (plan.branch === "alternate") {
            return 0;
        }

        return isFiniteNumber(plan.maxStops) ? Number(plan.maxStops) : 1;
    }

    function getEvaluationSummary(evaluation) {
        if (evaluation.failures && evaluation.failures.length) {
            return "Blocked: " + evaluation.failures.join(", ");
        }

        var parts = (evaluation.positives || []).slice(0, 3);
        if (evaluation.warnings && evaluation.warnings.length) {
            parts = parts.concat(evaluation.warnings.slice(0, 2));
        }

        return parts.length ? parts.join(", ") : "Matches the active rules";
    }

    function renderRuleResults(evaluation, limit) {
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

    function getTravelWindowText(plan) {
        var start = parseLocalDate(plan.anchorDate);

        if (!start) {
            return "Choose dates";
        }

        if (plan.tripStyle === "custom") {
            var end = parseLocalDate(plan.returnDate);
            return end ? formatDate(start) + " to " + formatDate(end) : "From " + formatDate(start);
        }

        var earliest = addDays(start, -1);
        var latest = addDays(start, plan.tripStyle === "long_weekend_plus_one" ? 4 : 3);
        return formatDate(earliest) + " to " + formatDate(latest);
    }

    function formatStops(stops) {
        var count = Number(stops || 0);
        if (count === 0) {
            return "Nonstop";
        }

        if (count === 1) {
            return "1 stop";
        }

        return count + " stops";
    }

    function formatFareClass(value) {
        var labels = {
            main: "Main cabin",
            basic: "Basic economy",
            comfort: "Comfort plus",
            premium: "Premium"
        };
        return labels[value] || "Fare";
    }

    function formatDepart(value) {
        if (!value) {
            return "not set";
        }

        var parts = value.split(":");
        var hour = Number(parts[0]);
        var minute = parts[1] || "00";
        var suffix = hour >= 12 ? "PM" : "AM";
        var displayHour = hour % 12 || 12;
        return displayHour + ":" + minute + " " + suffix;
    }

    function formatMoney(value) {
        var amount = Number(value || 0);
        if (!amount) {
            return "$0";
        }

        return "$" + Math.round(amount).toLocaleString();
    }

    function formatDate(date) {
        return date.toLocaleDateString([], {
            month: "short",
            day: "numeric"
        });
    }

    function formatDateTime(value) {
        var date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "date not set";
        }

        return date.toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function parseLocalDate(value) {
        if (!value) {
            return null;
        }

        var parts = value.split("-").map(Number);
        if (parts.length !== 3) {
            return null;
        }

        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function addDays(date, days) {
        var next = new Date(date.getTime());
        next.setDate(next.getDate() + days);
        return next;
    }

    function toDateTimeLocal(date) {
        var offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    }

    function isPm(value) {
        var hour = Number(String(value).split(":")[0]);
        return hour >= 12;
    }

    function tagHtml(category, label) {
        return "<span class=\"tag tag-" + escapeAttribute(category) + "\">" + escapeHtml(label) + "</span>";
    }

    function cleanAirport(value) {
        return String(value || "").trim().toUpperCase();
    }

    function shortAirline(value) {
        return String(value || "SkyTeam").split(/\s+/).slice(0, 2).join(" ");
    }

    function sameText(a, b) {
        return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    }

    function isFiniteNumber(value) {
        return Number.isFinite(Number(value));
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function findById(collection, id) {
        return collection.filter(function (item) {
            return item.id === id;
        })[0] || null;
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createId() {
        return "vp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }

    function slugify(value) {
        return String(value || "vacation-planner")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "vacation-planner";
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#039;"
            }[character];
        });
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replace(/`/g, "&#096;");
    }
})();
