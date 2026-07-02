/**
 * Adds expand/collapse chevrons to top-level sidebar anchors and toggles subsection visibility.
 */

const EXPANDED_STORAGE_KEY = "embeddables-sidebar-expanded";
const ANCHOR_SELECTOR = "#navigation-items > ul.list-none > li";
const FLAT_ANCHORS = new Set(["Glossary", "Changelog"]);

let isUpdating = false;

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
  return loadExpandedMap()[title] === true;
}

function getActiveAnchorTitle() {
  const activeLink = document.querySelector("a.nav-anchor[aria-current='location']");
  return activeLink ? normalizeLabel(activeLink.textContent) : null;
}

function createChevronButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "embeddables-anchor-chevron";
  button.setAttribute("aria-label", "Toggle section");
  button.innerHTML =
    '<svg width="8" height="24" viewBox="0 -9 3 24" aria-hidden="true" focusable="false" class="embeddables-anchor-chevron-icon"><path d="M0 0L3 3L0 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>';
  return button;
}

function wrapAnchorItem(item, link) {
  if (item.querySelector(".embeddables-anchor-row")) {
    return item.querySelector(".embeddables-anchor-chevron");
  }

  item.classList.add("embeddables-anchor-item");

  const row = document.createElement("div");
  row.className = "embeddables-anchor-row";

  link.classList.remove("mb-5", "sm:mb-4");
  link.parentElement?.insertBefore(row, link);
  row.appendChild(link);

  item.querySelector(".embeddables-anchor-chevron")?.remove();

  if (!shouldShowChevron(link)) {
    return null;
  }

  const chevron = createChevronButton();
  row.appendChild(chevron);
  return chevron;
}

function updateSubsectionVisibility(navItems) {
  const activeTitle = getActiveAnchorTitle();
  const shouldExpand = Boolean(
    activeTitle &&
      (FLAT_ANCHORS.has(activeTitle) || isAnchorExpanded(activeTitle)),
  );
  navItems.classList.toggle("embeddables-subsections-collapsed", !shouldExpand);
}

function updateChevronStates() {
  const activeTitle = getActiveAnchorTitle();
  const expanded = activeTitle ? isAnchorExpanded(activeTitle) : false;

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
  } finally {
    isUpdating = false;
  }
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
    updateSidebarCollapse();
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
      updateSidebarCollapse();
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
