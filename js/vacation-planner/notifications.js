import {
    formatMoney,
    toDateTimeLocal
} from "./utils.js";

export function renderNotificationState(app) {
    var els = app.els;

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

    if (app.state.notificationsEnabled && Notification.permission === "granted") {
        els.notificationState.className = "notification-state is-on";
        els.notificationState.textContent = "Browser alerts on";
        return;
    }

    els.notificationState.className = "notification-state";
    els.notificationState.textContent = "Browser alerts off";
}

export function enableNotifications(app) {
    if (!("Notification" in window)) {
        showAlertBanner(app, "Browser alerts are unavailable here.");
        renderNotificationState(app);
        return;
    }

    Notification.requestPermission().then(function (permission) {
        app.state.notificationsEnabled = permission === "granted";
        renderNotificationState(app);
        app.persistSoon();

        if (permission === "granted") {
            sendNotification(app, "Vacation Planner alerts enabled", "Alerts can appear while this page is open.", "planner-enabled");
        }
    });
}

export function testNotification(app) {
    var title = "Vacation Planner";
    var body = "Alert test for " + (app.state.currentPlan.destination || "your next trip") + ".";
    sendNotification(app, title, body, "planner-test");
}

export function sendNotification(app, title, body, tag) {
    showAlertBanner(app, body);

    if (!("Notification" in window)) {
        return;
    }

    if (app.state.notificationsEnabled && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            tag: tag
        });
    }
}

export function checkAlerts(app, quiet) {
    var activeAlerts = app.state.alerts.filter(function (alert) {
        return alert.active !== false;
    });
    var triggered = [];
    var now = new Date();

    activeAlerts.forEach(function (alert) {
        var match = getAlertMatch(app, alert);
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
            sendNotification(app, alert.name || "Fare alert", body, "planner-alert-" + alert.id);
        }
    });

    app.renderAlerts();
    app.persistSoon();
}

export function getAlertMatch(app, alert) {
    if (!alert.targetPrice) {
        return null;
    }

    var destination = String(alert.destination || "").toLowerCase();

    return app.state.candidates
        .filter(function (candidate) {
            var candidateDestination = String(candidate.destination || "").toLowerCase();
            var destinationMatches = !destination || !candidateDestination || destination === candidateDestination;
            return destinationMatches && Number(candidate.price || 0) > 0 && Number(candidate.price) <= Number(alert.targetPrice);
        })
        .sort(function (a, b) {
            return Number(a.price || 0) - Number(b.price || 0);
        })[0] || null;
}

export function alertRecentlyTriggered(alert) {
    if (!alert.lastTriggeredAt) {
        return false;
    }

    var last = new Date(alert.lastTriggeredAt).getTime();
    return Date.now() - last < 60 * 60 * 1000;
}

export function showAlertBanner(app, message) {
    app.els.alertBanner.textContent = message;
    app.els.alertBanner.classList.add("is-visible");
}

export function snoozeAlert(alert) {
    var next = new Date();
    next.setDate(next.getDate() + 1);
    alert.dueAt = toDateTimeLocal(next);
    alert.lastTriggeredAt = "";
}
