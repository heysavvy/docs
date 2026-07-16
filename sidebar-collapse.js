/**
 * Sidebar accordion for Mintlify anchors.
 *
 * Mintlify re-renders the sidebar on navigation and briefly paints an
 * un-enhanced tree. We re-apply enhancements synchronously in a
 * MutationObserver callback (before paint) to avoid flicker.
 */

const EXPANDED_STORAGE_KEY = "embeddables-sidebar-expanded";
const ANCHOR_SELECTOR = "#navigation-items > ul.list-none > li";
const FLAT_ANCHORS = new Set(["Welcome", "Contact Support"]);
const CLI_GROUP_SELECTOR = 'li[data-title="CLI"]';
const ACCORDION_MS = 450;
const ACCORDION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

let isUpdating = false;
let suppressObserver = false;
let cliGroupManuallyExpanded = false;
/** Soft-animate only when the user clicks a section chevron. */
let animatePanelToggle = false;

function normalizeLabel(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getNavigationItems() {
  return document.getElementById("navigation-items");
}

function getAnchorLink(item) {
  return item.querySelector(":scope > a.nav-anchor, :scope > .embeddables-anchor-row a.nav-anchor, a.nav-anchor");
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
  if (!Object.prototype.hasOwnProperty.call(map, title)) {
    return true;
  }
  return map[title] === true;
}

function shouldShowSubsections(activeTitle) {
  if (!activeTitle || FLAT_ANCHORS.has(activeTitle)) {
    return false;
  }
  return isAnchorExpanded(activeTitle);
}

function isExpandableAnchor(title) {
  return Boolean(title) && !FLAT_ANCHORS.has(title);
}

function getActiveAnchorTitle() {
  const activeLink = document.querySelector(
    "a.nav-anchor[aria-current='location']",
  );
  return activeLink ? normalizeLabel(activeLink.textContent) : null;
}

function getCurrentPath() {
  return (
    document.documentElement.getAttribute("data-current-path") ||
    window.location.pathname.replace(/\/$/, "") ||
    "/"
  );
}

function withObserverSuppressed(fn) {
  suppressObserver = true;
  try {
    return fn();
  } finally {
    suppressObserver = false;
  }
}

function queueEnhancementVerify() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const navItems = getNavigationItems();
      if (navItems && navNeedsEnhancement(navItems)) {
        updateSidebarCollapse();
      }
    });
  });
}

function animateHeight(element, open, { immediate = false } = {}) {
  if (!element) {
    return;
  }

  const currentlyOpen = element.dataset.accordionOpen === "true";
  const isAnimating = element.dataset.accordionAnimating === "true";

  if (currentlyOpen === open && !isAnimating) {
    return;
  }
  if (currentlyOpen === open && isAnimating && !immediate) {
    return;
  }

  const token = String((Number(element.dataset.accordionToken) || 0) + 1);
  element.dataset.accordionToken = token;
  element.hidden = false;
  element.dataset.accordionOpen = open ? "true" : "false";
  element.style.overflow = "hidden";

  if (immediate) {
    element.style.transition = "none";
    element.style.height = open ? "auto" : "0px";
    element.style.opacity = open ? "1" : "0";
    element.dataset.accordionAnimating = "false";
    if (open) {
      element.style.overflow = "";
    }
    return;
  }

  element.dataset.accordionAnimating = "true";

  const finish = (event) => {
    if (element.dataset.accordionToken !== token) {
      return;
    }
    if (event && event.propertyName && event.propertyName !== "height") {
      return;
    }
    element.removeEventListener("transitionend", finish);
    element.dataset.accordionAnimating = "false";
    if (open) {
      element.style.height = "auto";
      element.style.overflow = "";
      element.style.transition = "";
    }
  };

  if (open) {
    element.style.transition = "none";
    element.style.height = "0px";
    element.style.opacity = "0";
    void element.offsetHeight;
    const target = element.scrollHeight;
    element.style.transition = [
      `height ${ACCORDION_MS}ms ${ACCORDION_EASING}`,
      `opacity ${ACCORDION_MS}ms ease`,
    ].join(", ");
    requestAnimationFrame(() => {
      if (element.dataset.accordionToken !== token) {
        return;
      }
      element.style.height = `${target}px`;
      element.style.opacity = "1";
    });
  } else {
    const current =
      element.style.height === "auto" || !element.style.height
        ? element.scrollHeight
        : element.getBoundingClientRect().height;
    element.style.transition = "none";
    element.style.height = `${Math.max(current, 0)}px`;
    element.style.opacity = "1";
    void element.offsetHeight;
    element.style.transition = [
      `height ${ACCORDION_MS}ms ${ACCORDION_EASING}`,
      `opacity ${Math.round(ACCORDION_MS * 0.7)}ms ease`,
    ].join(", ");
    requestAnimationFrame(() => {
      if (element.dataset.accordionToken !== token) {
        return;
      }
      element.style.height = "0px";
      element.style.opacity = "0";
    });
  }

  element.addEventListener("transitionend", finish);
  window.setTimeout(finish, ACCORDION_MS + 80);
}

function getGroupSubmenu(group, button) {
  const controlsId = button?.getAttribute("aria-controls");
  return (
    (controlsId && document.getElementById(controlsId)) ||
    group.querySelector(":scope > ul")
  );
}

function maybeResetCliGroupState() {
  const path = getCurrentPath();
  const isCliSectionPage =
    path.startsWith("/cli") || path === "/reference/changelog/cli-changelog";

  if (!isCliSectionPage) {
    cliGroupManuallyExpanded = false;
  }
}

function setGroupExpanded(
  group,
  button,
  submenu,
  expanded,
  { immediate = false } = {},
) {
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  group.classList.toggle("embeddables-group-expanded", expanded);

  if (group.matches(CLI_GROUP_SELECTOR)) {
    group.classList.toggle("embeddables-cli-expanded", expanded);
  }

  const chevron =
    button.querySelector("svg[width='8']") || button.querySelector("svg");
  chevron?.classList.toggle("rotate-90", expanded);

  animateHeight(submenu, expanded, { immediate });
}

function bindSidebarGroupToggles() {
  const groups = document.querySelectorAll("#sidebar-content li[data-title]");

  for (const group of groups) {
    const button = group.querySelector(":scope > button");
    const submenu = getGroupSubmenu(group, button);

    if (!button || !submenu) {
      continue;
    }

    const isCli = group.matches(CLI_GROUP_SELECTOR);
    const preferredExpanded = isCli
      ? cliGroupManuallyExpanded
      : button.getAttribute("aria-expanded") === "true" ||
        group.classList.contains("embeddables-group-expanded");
    const openAttr = preferredExpanded ? "true" : "false";

    if (submenu.dataset.accordionReady !== "true") {
      submenu.dataset.accordionReady = "true";
      setGroupExpanded(group, button, submenu, preferredExpanded, {
        immediate: true,
      });
    } else if (
      isCli &&
      submenu.dataset.accordionOpen !== openAttr &&
      submenu.dataset.accordionAnimating !== "true"
    ) {
      setGroupExpanded(group, button, submenu, preferredExpanded, {
        immediate: true,
      });
    }

    if (button.dataset.embeddablesGroupBound === "true") {
      continue;
    }

    button.dataset.embeddablesGroupBound = "true";

    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const next = button.getAttribute("aria-expanded") !== "true";
        if (isCli) {
          cliGroupManuallyExpanded = next;
        }
        setGroupExpanded(group, button, submenu, next);
      },
      true,
    );
  }
}

function createChevronButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "embeddables-anchor-chevron";
  button.setAttribute("aria-label", "Toggle section");
  button.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" focusable="false" class="embeddables-anchor-chevron-icon"><path d="M4 2.5L9.5 7L4 11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
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

/**
 * Enhance an anchor `li` without wrapping the link in a new flex row.
 * Wrapping caused visible layout jumps every time React re-rendered.
 */
function enhanceAnchorItem(item, link) {
  item.classList.add("embeddables-anchor-item");

  // Migrate leftover row wrappers from older script versions.
  const legacyRow = item.querySelector(":scope > .embeddables-anchor-row");
  if (legacyRow) {
    while (legacyRow.firstChild) {
      item.insertBefore(legacyRow.firstChild, legacyRow);
    }
    legacyRow.remove();
  }

  const showChevron = shouldShowChevron(link);
  let chevron = item.querySelector(":scope > .embeddables-anchor-chevron");

  if (!showChevron) {
    chevron?.remove();
    return null;
  }

  if (!chevron) {
    chevron = createChevronButton();
    // Keep chevron after the anchor link, before any accordion panel.
    const panel = item.querySelector(":scope > .embeddables-subsections-panel");
    if (panel) {
      item.insertBefore(chevron, panel);
    } else {
      item.appendChild(chevron);
    }
  }

  return chevron;
}

function isLooseSubsection(element) {
  if (element.matches("ul.list-none")) {
    return false;
  }
  if (element.classList?.contains("embeddables-subsections-panel")) {
    return false;
  }
  if (element.tagName === "SCRIPT" || element.tagName === "STYLE") {
    return false;
  }
  return true;
}

function ensureSubsectionsPanel(navItems, hostItem) {
  let panel =
    navItems.querySelector(".embeddables-subsections-panel") ||
    document.querySelector("#sidebar-content .embeddables-subsections-panel");
  let inner = panel?.querySelector(
    ":scope > .embeddables-subsections-panel__inner",
  );

  if (!panel || !inner) {
    panel = document.createElement("div");
    panel.className = "embeddables-subsections-panel";
    inner = document.createElement("div");
    inner.className = "embeddables-subsections-panel__inner";
    panel.appendChild(inner);
  }

  const looseSubsections = [...navItems.children].filter(isLooseSubsection);

  for (const element of looseSubsections) {
    if (element.parentElement !== inner) {
      inner.appendChild(element);
    }
  }

  if (hostItem) {
    if (panel.parentElement !== hostItem) {
      hostItem.appendChild(panel);
    }
  } else if (panel.parentElement !== navItems) {
    navItems.appendChild(panel);
  }

  return panel;
}

function setPanelExpanded(panel, shouldExpand, { animate }) {
  const isExpanded = panel.classList.contains(
    "embeddables-subsections-panel--expanded",
  );

  if (isExpanded === shouldExpand) {
    return;
  }

  if (!animate) {
    panel.classList.add("embeddables-subsections-panel--instant");
    panel.classList.toggle(
      "embeddables-subsections-panel--expanded",
      shouldExpand,
    );
    void panel.offsetHeight;
    panel.classList.remove("embeddables-subsections-panel--instant");
    return;
  }

  panel.classList.remove("embeddables-subsections-panel--instant");
  void panel.offsetHeight;
  panel.classList.toggle(
    "embeddables-subsections-panel--expanded",
    shouldExpand,
  );
}

function updateSubsectionVisibility(navItems) {
  const activeTitle = getActiveAnchorTitle();
  const shouldExpand = shouldShowSubsections(activeTitle);
  const hostItem = isExpandableAnchor(activeTitle)
    ? getAnchorItemByTitle(activeTitle)
    : null;

  const panel = ensureSubsectionsPanel(navItems, hostItem);
  const shouldAnimate = animatePanelToggle;
  animatePanelToggle = false;

  setPanelExpanded(panel, shouldExpand, { animate: shouldAnimate });
}

function updateChevronStates() {
  const activeTitle = getActiveAnchorTitle();
  const expanded = shouldShowSubsections(activeTitle);

  for (const item of document.querySelectorAll(ANCHOR_SELECTOR)) {
    const link = getAnchorLink(item);
    const chevron = item.querySelector(":scope > .embeddables-anchor-chevron");

    if (!link || !chevron) {
      continue;
    }

    const title = normalizeLabel(link.textContent);
    const isExpanded = title === activeTitle && expanded;

    chevron.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    chevron.classList.toggle(
      "embeddables-anchor-chevron--expanded",
      isExpanded,
    );
  }
}

function bindAnchorInteractions() {
  for (const item of document.querySelectorAll(ANCHOR_SELECTOR)) {
    const link = getAnchorLink(item);
    const chevron = item.querySelector(":scope > .embeddables-anchor-chevron");

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
        animatePanelToggle = true;
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
    enhanceAnchorItem(item, link);
  }
}

function navNeedsEnhancement(navItems) {
  const anchors = navItems.querySelectorAll(ANCHOR_SELECTOR);
  if (!anchors.length) {
    return false;
  }

  if (navItems.dataset.embeddablesReady !== "true") {
    return true;
  }

  // React wiped our chevron/panel enhancements.
  if (!navItems.querySelector(".embeddables-anchor-item")) {
    return true;
  }

  // Fresh Mintlify groups appeared outside the accordion panel.
  if ([...navItems.children].some(isLooseSubsection)) {
    return true;
  }

  return false;
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

  withObserverSuppressed(() => {
    try {
      enhanceAnchorItems();
      bindAnchorInteractions();
      updateSubsectionVisibility(navItems);
      updateChevronStates();
      maybeResetCliGroupState();
      bindSidebarGroupToggles();
      navItems.dataset.embeddablesReady = "true";
    } finally {
      isUpdating = false;
    }
  });

  // React often mutates again right after our pass — verify on next frames.
  queueEnhancementVerify();
}

function pollForSidebarSettle(maxChecks = 24, intervalMs = 40) {
  let checks = 0;

  const tick = () => {
    const navItems = getNavigationItems();
    if (navItems && navNeedsEnhancement(navItems)) {
      updateSidebarCollapse();
    }

    checks += 1;
    if (checks < maxChecks) {
      window.setTimeout(tick, intervalMs);
    }
  };

  tick();
}

function initSidebarCollapse() {
  let attempts = 0;

  const tryUpdate = () => {
    updateSidebarCollapse();
    attempts += 1;
    if (!getNavigationItems() && attempts < 20) {
      requestAnimationFrame(tryUpdate);
    }
  };

  tryUpdate();

  const pathObserver = new MutationObserver(() => {
    animatePanelToggle = false;
    // Mintlify replaces sidebar nodes across a few frames after path changes.
    pollForSidebarSettle();
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
      if (suppressObserver || isUpdating) {
        return;
      }

      const navItems = getNavigationItems();
      if (!navItems) {
        return;
      }

      if (navNeedsEnhancement(navItems)) {
        updateSidebarCollapse();
      }
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
