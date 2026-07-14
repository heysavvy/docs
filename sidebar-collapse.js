/**
 * Adds expand/collapse chevrons to top-level sidebar anchors and toggles subsection visibility.
 */

const EXPANDED_STORAGE_KEY = "embeddables-sidebar-expanded";
const ANCHOR_SELECTOR = "#navigation-items > ul.list-none > li";
const FLAT_ANCHORS = new Set(["Welcome", "Glossary", "Changelog"]);
const CLI_GROUP_SELECTOR = 'li[data-title="CLI"]';

let isUpdating = false;
let cliGroupManuallyExpanded = false;
let isApplyingCliGroupState = false;

function normalizeLabel(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getNavigationItems() {
  return document.getElementById("navigation-items");
}

function getAnchorLink(item) {
  return item.querySelector("a.nav-anchor");
}

function isExternalAnchor(link) {
  const href = link.getAttribute("href") ?? "";
  return href.startsWith("mailto:") || link.target === "_blank";
}

function shouldShowChevron(link) {
  if (isExternalAnchor(link)) {
    return false;
  }

  return !FLAT_ANCHORS.has(normalizeLabel(link.textContent));
}

function loadExpandedMap() {
  try {
    return JSON.parse(sessionStorage.getItem(EXPANDED_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveExpandedMap(map) {
  sessionStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(map));
}

function setAnchorExpanded(title, expanded) {
  const map = loadExpandedMap();
  map[title] = expanded;
  saveExpandedMap(map);
}

function isAnchorExpanded(title) {
  const map = loadExpandedMap();
  // Default open for the active section so landing on a docs page shows
  // its subsections under the section title (accordion), not collapsed.
  if (!Object.prototype.hasOwnProperty.call(map, title)) {
    return true;
  }
  return map[title] === true;
}

function shouldShowSubsections(activeTitle) {
  if (!activeTitle) {
    return false;
  }
  if (FLAT_ANCHORS.has(activeTitle)) {
    return true;
  }
  return isAnchorExpanded(activeTitle);
}

function getActiveAnchorTitle() {
  const activeLink = document.querySelector("a.nav-anchor[aria-current='location']");
  return activeLink ? normalizeLabel(activeLink.textContent) : null;
}

function getCurrentPath() {
  return (
    document.documentElement.getAttribute("data-current-path") ||
    window.location.pathname.replace(/\/$/, "") ||
    "/"
  );
}

function getCliGroupElements() {
  const group = document.querySelector(CLI_GROUP_SELECTOR);
  if (!group) {
    return null;
  }

  const button = group.querySelector(":scope > button");
  const controlsId = button?.getAttribute("aria-controls");
  const submenu =
    (controlsId && document.getElementById(controlsId)) ||
    group.querySelector(":scope > ul");

  if (!button || !submenu) {
    return null;
  }

  return { group, button, submenu };
}

function maybeResetCliGroupState() {
  const path = getCurrentPath();
  const isCliSectionPage =
    path.startsWith("/cli") || path === "/reference/changelog/cli-changelog";

  if (!isCliSectionPage) {
    cliGroupManuallyExpanded = false;
  }
}

function applyCliGroupState() {
  if (isApplyingCliGroupState) {
    return;
  }

  const elements = getCliGroupElements();
  if (!elements) {
    return;
  }

  const { group, button, submenu } = elements;
  const expanded = cliGroupManuallyExpanded;

  isApplyingCliGroupState = true;

  try {
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
    group.classList.toggle("embeddables-cli-expanded", expanded);

    const chevron =
      button.querySelector("svg[width='8']") || button.querySelector("svg");
    chevron?.classList.toggle("rotate-90", expanded);

    submenu.hidden = !expanded;
  } finally {
    isApplyingCliGroupState = false;
  }
}

function bindCliGroupToggle() {
  const elements = getCliGroupElements();
  if (!elements) {
    return;
  }

  const { button } = elements;

  if (button.dataset.embeddablesCliBound === "true") {
    return;
  }

  button.dataset.embeddablesCliBound = "true";

  button.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      cliGroupManuallyExpanded = !cliGroupManuallyExpanded;
      applyCliGroupState();
    },
    true,
  );
}

function createChevronButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "embeddables-anchor-chevron";
  button.setAttribute("aria-label", "Toggle section");
  button.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" class="embeddables-anchor-chevron-icon"><path d="M4 2.5L9.5 7L4 11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  return button;
}

function getAnchorItemByTitle(title) {
  if (!title) {
    return null;
  }

  for (const item of document.querySelectorAll(ANCHOR_SELECTOR)) {
    const link = getAnchorLink(item);
    if (link && normalizeLabel(link.textContent) === title) {
      return item;
    }
  }

  return null;
}

function getAccordionHostItem() {
  const activeTitle = getActiveAnchorTitle();
  if (!activeTitle || !shouldShowSubsections(activeTitle)) {
    return null;
  }
  return getAnchorItemByTitle(activeTitle);
}

function wrapAnchorItem(item, link) {
  let row = item.querySelector(".embeddables-anchor-row");

  item.classList.add("embeddables-anchor-item");

  if (!row) {
    row = document.createElement("div");
    row.className = "embeddables-anchor-row";
    link.classList.remove("mb-5", "sm:mb-4");
    link.parentElement?.insertBefore(row, link);
    row.appendChild(link);
  }

  const existingChevron = row.querySelector(".embeddables-anchor-chevron");
  const showChevron = shouldShowChevron(link);

  if (!showChevron) {
    existingChevron?.remove();
    return null;
  }

  if (existingChevron) {
    return existingChevron;
  }

  const chevron = createChevronButton();
  row.appendChild(chevron);
  return chevron;
}

function ensureSubsectionsPanel(navItems, hostItem) {
  let panel =
    navItems.querySelector(".embeddables-subsections-panel") ||
    document.querySelector("#sidebar-content .embeddables-subsections-panel");
  let inner = panel?.querySelector(":scope > .embeddables-subsections-panel__inner");

  if (!panel || !inner) {
    panel = document.createElement("div");
    panel.className = "embeddables-subsections-panel";
    inner = document.createElement("div");
    inner.className = "embeddables-subsections-panel__inner";
    panel.appendChild(inner);
  }

  const looseSubsections = [...navItems.children].filter(
    (element) =>
      !element.matches("ul.list-none") &&
      !element.matches(".embeddables-subsections-panel"),
  );

  for (const element of looseSubsections) {
    inner.appendChild(element);
  }

  // Mintlify renders anchor subsections after all top-level anchors.
  // Re-home them under the expanded section so they read as an accordion.
  if (hostItem) {
    hostItem.appendChild(panel);
  } else if (panel.parentElement !== navItems) {
    navItems.appendChild(panel);
  }

  return panel;
}

function updateSubsectionVisibility(navItems) {
  const activeTitle = getActiveAnchorTitle();
  const shouldExpand = shouldShowSubsections(activeTitle);
  const hostItem = shouldExpand ? getAccordionHostItem() : null;
  const panel = ensureSubsectionsPanel(navItems, hostItem);
  panel.classList.toggle("embeddables-subsections-panel--expanded", shouldExpand);
}

function updateChevronStates() {
  const activeTitle = getActiveAnchorTitle();
  const expanded = shouldShowSubsections(activeTitle);

  for (const item of document.querySelectorAll(ANCHOR_SELECTOR)) {
    const link = getAnchorLink(item);
    const chevron = item.querySelector(".embeddables-anchor-chevron");

    if (!link || !chevron) {
      continue;
    }

    const title = normalizeLabel(link.textContent);
    const isActive = title === activeTitle;
    const isExpanded = isActive && expanded;

    chevron.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    chevron.classList.toggle("embeddables-anchor-chevron--expanded", isExpanded);
  }
}

function bindAnchorInteractions() {
  for (const item of document.querySelectorAll(ANCHOR_SELECTOR)) {
    const link = getAnchorLink(item);
    const chevron = item.querySelector(".embeddables-anchor-chevron");

    if (!link || link.dataset.embeddablesBound === "true") {
      continue;
    }

    link.dataset.embeddablesBound = "true";

    link.addEventListener("click", () => {
      const title = normalizeLabel(link.textContent);

      if (isExternalAnchor(link) || FLAT_ANCHORS.has(title)) {
        return;
      }

      setAnchorExpanded(title, true);
    });

    if (!chevron || chevron.dataset.embeddablesBound === "true") {
      continue;
    }

    chevron.dataset.embeddablesBound = "true";

    chevron.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const title = normalizeLabel(link.textContent);
      const activeTitle = getActiveAnchorTitle();

      if (title === activeTitle) {
        setAnchorExpanded(title, !isAnchorExpanded(title));
        updateSidebarCollapse();
        return;
      }

      setAnchorExpanded(title, true);
      link.click();
    });
  }
}

function enhanceAnchorItems() {
  for (const item of document.querySelectorAll(ANCHOR_SELECTOR)) {
    const link = getAnchorLink(item);
    if (!link) {
      continue;
    }

    wrapAnchorItem(item, link);
  }
}

function updateSidebarCollapse() {
  if (isUpdating) {
    return;
  }

  const navItems = getNavigationItems();
  if (!navItems) {
    return;
  }

  isUpdating = true;

  try {
    enhanceAnchorItems();
    bindAnchorInteractions();
    updateSubsectionVisibility(navItems);
    updateChevronStates();
    maybeResetCliGroupState();
    bindCliGroupToggle();
    applyCliGroupState();
  } finally {
    isUpdating = false;
  }
}

function initSidebarCollapse() {
  let attempts = 0;
  let debounceTimer = null;

  const tryUpdate = () => {
    updateSidebarCollapse();
    attempts += 1;

    if (!getNavigationItems() && attempts < 20) {
      requestAnimationFrame(tryUpdate);
    }
  };

  const scheduleUpdate = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      updateSidebarCollapse();
    }, 30);
  };

  tryUpdate();

  // Re-apply after React hydration — Mintlify often rebuilds the sidebar DOM.
  for (const ms of [100, 400, 1000, 2000]) {
    setTimeout(updateSidebarCollapse, ms);
  }

  const pathObserver = new MutationObserver(() => {
    scheduleUpdate();
  });

  pathObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-current-path"],
  });

  const watchSidebar = () => {
    const sidebar = document.getElementById("sidebar-content");
    if (!sidebar) {
      requestAnimationFrame(watchSidebar);
      return;
    }

    const sidebarObserver = new MutationObserver(() => {
      scheduleUpdate();
    });

    sidebarObserver.observe(sidebar, {
      childList: true,
      subtree: true,
    });
  };

  watchSidebar();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebarCollapse);
} else {
  initSidebarCollapse();
}
