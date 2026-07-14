import { LOCAL_DISCOVERY_API_BASE } from "./constants.js";

export function getTravelWindowText(plan) {
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

export function formatStops(stops) {
    var count = Number(stops || 0);
    if (count === 0) {
        return "Nonstop";
    }

    if (count === 1) {
        return "1 stop";
    }

    return count + " stops";
}

export function formatFareClass(value) {
    var labels = {
        main: "Main cabin",
        basic: "Basic economy",
        comfort: "Comfort plus",
        premium: "Premium"
    };
    return labels[value] || "Fare";
}

export function formatDepart(value) {
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

export function formatMoney(value) {
    var amount = Number(value || 0);
    if (!amount) {
        return "$0";
    }

    return "$" + Math.round(amount).toLocaleString();
}

export function formatDate(date) {
    return date.toLocaleDateString([], {
        month: "short",
        day: "numeric"
    });
}

export function formatDateTime(value) {
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

export function formatProvider(value) {
    var labels = {
        mock: "Mock API",
        amadeus: "Amadeus"
    };
    return labels[value] || "Search API";
}

export function normalizeAirlineType(value, airline) {
    var type = String(value || "").toLowerCase();

    if (type === "skyteam" || type === "other" || type === "frontier") {
        return type;
    }

    return /frontier/i.test(airline || "") ? "frontier" : "other";
}

export function normalizeFareClass(value) {
    var fareClass = String(value || "").toLowerCase();
    var allowed = ["basic", "main", "comfort", "premium"];
    return allowed.indexOf(fareClass) >= 0 ? fareClass : "main";
}

export function normalizeTime(value) {
    var time = String(value || "").trim();
    var match = time.match(/^(\d{2}):(\d{2})/);
    return match ? match[1] + ":" + match[2] : "";
}

export function parseLocalDate(value) {
    if (!value) {
        return null;
    }

    var parts = value.split("-").map(Number);
    if (parts.length !== 3) {
        return null;
    }

    return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function toDateInputValue(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
}

export function addDays(date, days) {
    var next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
}

export function toDateTimeLocal(date) {
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function isPm(value) {
    var hour = Number(String(value).split(":")[0]);
    return hour >= 12;
}

export function tagHtml(category, label) {
    return "<span class=\"tag tag-" + escapeAttribute(category) + "\">" + escapeHtml(label) + "</span>";
}

export function cleanAirport(value) {
    return String(value || "").trim().toUpperCase();
}

export function getDiscoveryApiBase() {
    var queryValue = new URLSearchParams(window.location.search).get("plannerApi");
    var configured = queryValue || "";
    var meta = document.querySelector("meta[name='planner-api-base']");

    if (!configured && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")) {
        configured = LOCAL_DISCOVERY_API_BASE;
    }

    if (!configured && meta) {
        configured = meta.getAttribute("content") || "";
    }

    return configured.replace(/\/$/, "");
}

export function shortAirline(value) {
    return String(value || "SkyTeam").split(/\s+/).slice(0, 2).join(" ");
}

export function sameText(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

export function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function findById(collection, id) {
    return collection.filter(function (item) {
        return item.id === id;
    })[0] || null;
}

export function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function createId() {
    return "vp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function slugify(value) {
    return String(value || "vacation-planner")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "vacation-planner";
}

export function escapeHtml(value) {
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

export function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
}
