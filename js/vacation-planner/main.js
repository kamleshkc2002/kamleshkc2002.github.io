import { SAVE_DELAY, STORAGE_KEY } from "./constants.js";
import {
    clearDiscoveryStatus,
    discoverFlights
} from "./discovery.js";
import {
    checkAlerts,
    enableNotifications,
    snoozeAlert,
    testNotification
} from "./notifications.js";
import {
    renderAlerts,
    renderAll,
    renderCandidates,
    renderDiscoveryStatus
} from "./render.js";
import { defaultState, loadState } from "./state.js";
import {
    cleanAirport,
    clone,
    createId,
    escapeHtml,
    findById,
    isFiniteNumber,
    slugify
} from "./utils.js";

var saveTimer = null;

var app = {
    state: loadState(),
    els: {},
    discoveryInFlight: false,
    readPlannerForm: readPlannerForm,
    renderAll: function () {
        renderAll(app);
    },
    renderAlerts: function () {
        renderAlerts(app);
    },
    renderDiscoveryStatus: function () {
        renderDiscoveryStatus(app);
    },
    persistSoon: persistSoon,
    checkAlerts: function (quiet) {
        checkAlerts(app, quiet);
    }
};
var els = app.els;

document.addEventListener("DOMContentLoaded", init);

function init() {
    cacheElements();
    fillPlannerForm();
    bindEvents();
    updateDateControls();
    renderAll(app);
    checkAlerts(app, true);
    window.setInterval(function () {
        checkAlerts(app, false);
    }, 30000);
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
        "optionSummary",
        "recommendationBoard",
        "discoveryForm",
        "discoverFlights",
        "discoveryStatus",
        "discoveryProvider",
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
    els.discoveryForm.addEventListener("submit", function (event) {
        discoverFlights(app, event);
    });
    els.candidateForm.addEventListener("submit", addCandidate);
    els.clearCandidates.addEventListener("click", clearCandidates);
    els.candidateFilter.addEventListener("change", function () {
        renderCandidates(app);
    });
    els.candidateSort.addEventListener("change", function () {
        renderCandidates(app);
    });
    els.candidateList.addEventListener("click", handleCandidateClick);
    els.alertForm.addEventListener("submit", addAlert);
    els.alertList.addEventListener("click", handleAlertClick);
    els.savedPlansList.addEventListener("click", handleSavedPlanClick);
    els.clearSavedPlans.addEventListener("click", clearSavedPlans);
    els.enableNotifications.addEventListener("click", function () {
        enableNotifications(app);
    });
    els.testNotification.addEventListener("click", function () {
        testNotification(app);
    });
    els.printPlanner.addEventListener("click", function () {
        window.print();
    });
    els.exportPlanner.addEventListener("click", exportPlanner);
    els.importPlanner.addEventListener("change", importPlanner);
}

function fillPlannerForm() {
    var plan = app.state.currentPlan;
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

    app.state.currentPlan = Object.assign({}, app.state.currentPlan, {
        tripName: els.tripName.value.trim(),
        destination: cleanAirport(els.destination.value),
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
    clearDiscoveryStatus(app);
    updateDateControls();
    renderAll(app);
    persistSoon();
}

function updateDateControls() {
    var style = app.state.currentPlan.tripStyle;
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
        origin: app.state.currentPlan.origin || "BOS",
        destination: app.state.currentPlan.destination,
        createdAt: new Date().toISOString()
    };

    app.state.candidates.push(candidate);
    els.candidateForm.reset();
    setCandidateDefaults();
    renderAll(app);
    persistSoon();
    checkAlerts(app, false);
}

function setCandidateDefaults() {
    var branch = app.state.currentPlan.branch || "preferred";
    els.candidateAirlineType.value = branch === "alternate" ? "other" : "skyteam";
    els.candidateStops.value = branch === "alternate" ? "0" : "1";
    els.candidateFareClass.value = "main";
}

function clearCandidates() {
    if (!app.state.candidates.length) {
        return;
    }

    if (window.confirm("Clear all flight candidates for the current plan?")) {
        app.state.candidates = [];
        renderAll(app);
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
    var candidate = findById(app.state.candidates, id);

    if (!candidate) {
        return;
    }

    if (action === "delete") {
        app.state.candidates = app.state.candidates.filter(function (item) {
            return item.id !== id;
        });
    }

    if (action === "watch") {
        app.state.alerts.push({
            id: createId(),
            name: "Watch " + (candidate.airline || "flight"),
            targetPrice: Math.max(0, Number(candidate.price || 0) - 25),
            dueAt: "",
            destination: candidate.destination || app.state.currentPlan.destination,
            active: true,
            createdAt: new Date().toISOString(),
            lastTriggeredAt: ""
        });
    }

    renderAll(app);
    persistSoon();
}

function addAlert(event) {
    event.preventDefault();

    app.state.alerts.push({
        id: createId(),
        name: els.alertName.value.trim() || "Fare alert",
        targetPrice: Number(els.alertTarget.value || 0),
        dueAt: els.alertDue.value,
        destination: app.state.currentPlan.destination,
        active: true,
        createdAt: new Date().toISOString(),
        lastTriggeredAt: ""
    });

    els.alertForm.reset();
    renderAll(app);
    persistSoon();
    checkAlerts(app, false);
}

function handleAlertClick(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) {
        return;
    }

    var id = button.getAttribute("data-id");
    var action = button.getAttribute("data-action");
    var alert = findById(app.state.alerts, id);

    if (!alert) {
        return;
    }

    if (action === "done") {
        alert.active = false;
    }

    if (action === "delete") {
        app.state.alerts = app.state.alerts.filter(function (item) {
            return item.id !== id;
        });
    }

    if (action === "snooze") {
        snoozeAlert(alert);
    }

    renderAll(app);
    persistSoon();
}

function saveCurrentPlan() {
    readPlannerForm();

    var id = app.state.currentPlan.id || createId();
    app.state.currentPlan.id = id;

    var snapshot = {
        id: id,
        name: app.state.currentPlan.tripName,
        origin: app.state.currentPlan.origin,
        destination: app.state.currentPlan.destination,
        savedAt: new Date().toISOString(),
        currentPlan: clone(app.state.currentPlan),
        candidates: clone(app.state.candidates),
        alerts: clone(app.state.alerts)
    };

    app.state.savedPlans = app.state.savedPlans.filter(function (plan) {
        return plan.id !== id;
    });
    app.state.savedPlans.push(snapshot);

    renderAll(app);
    persistNow();
}

function handleSavedPlanClick(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) {
        return;
    }

    var id = button.getAttribute("data-id");
    var action = button.getAttribute("data-action");
    var saved = findById(app.state.savedPlans, id);

    if (!saved) {
        return;
    }

    if (action === "delete") {
        app.state.savedPlans = app.state.savedPlans.filter(function (plan) {
            return plan.id !== id;
        });
    }

    if (action === "load") {
        app.state.currentPlan = Object.assign({}, defaultState().currentPlan, saved.currentPlan || {});
        app.state.currentPlan.id = saved.id;
        app.state.candidates = clone(saved.candidates || []);
        app.state.alerts = clone(saved.alerts || []);
        fillPlannerForm();
        updateDateControls();
    }

    renderAll(app);
    persistSoon();
}

function clearSavedPlans() {
    if (!app.state.savedPlans.length) {
        return;
    }

    if (window.confirm("Clear all saved plans from this browser?")) {
        app.state.savedPlans = [];
        renderAll(app);
        persistSoon();
    }
}

function resetCurrentPlan() {
    if (!window.confirm("Reset the current planner form and flight candidates?")) {
        return;
    }

    app.state.currentPlan = defaultState().currentPlan;
    app.state.candidates = [];
    app.state.alerts = [];
    fillPlannerForm();
    setCandidateDefaults();
    updateDateControls();
    renderAll(app);
    persistSoon();
}

function exportPlanner() {
    persistNow();

    var blob = new Blob([JSON.stringify(app.state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    var name = app.state.currentPlan.tripName || app.state.currentPlan.destination || "vacation-planner";

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
            app.state = {
                currentPlan: Object.assign({}, base.currentPlan, imported.currentPlan || {}),
                candidates: Array.isArray(imported.candidates) ? imported.candidates : [],
                alerts: Array.isArray(imported.alerts) ? imported.alerts : [],
                savedPlans: Array.isArray(imported.savedPlans) ? imported.savedPlans : [],
                discovery: Object.assign({}, base.discovery, imported.discovery || {}),
                notificationsEnabled: Boolean(imported.notificationsEnabled),
                updatedAt: imported.updatedAt || ""
            };
            fillPlannerForm();
            updateDateControls();
            renderAll(app);
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
    app.state.updatedAt = new Date().toISOString();

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
        updateSaveState();
    } catch (error) {
        els.saveState.innerHTML = "<i class=\"fa fa-exclamation-triangle\" aria-hidden=\"true\"></i> Local save blocked";
    }
}

function updateSaveState() {
    var time = app.state.updatedAt ? new Date(app.state.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    els.saveState.innerHTML = "<i class=\"fa fa-check-circle\" aria-hidden=\"true\"></i> Saved" + (time ? " " + escapeHtml(time) : " locally");
}
