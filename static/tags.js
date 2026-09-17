const input = document.getElementById('item_tags');
const maxSelectedTags  = 10
const sortTagsDropdown = document.getElementById('sort_tags');
let tags = [];
let filterTags = [];
let tagFilterMode = localStorage.getItem('tag_filter_mode') || 'any';
const tagify = new Tagify(input, {
    whitelist: [],
    dropdown: {
        enabled: 0
    },
    duplicates: false, // Disallow duplicate tags
    maxTags: maxSelectedTags // Set a maximum limit for tags (adjust as needed)
});

tagify.on('add', SubmitTags);
tagify.on('remove', SubmitTags);

function commitTagifyInput() {
    if (typeof tagify !== 'undefined' && tagify && tagify.DOM && tagify.DOM.input) {
        const rawText = tagify.DOM.input.textContent ? tagify.DOM.input.textContent.trim() : '';
        if (rawText) {
            tagify.addTags(rawText);
            if (tagify.DOM && tagify.DOM.input) {
                tagify.DOM.input.textContent = '';
            }
        }
    }
}

function SubmitTags() {
    if (!tagify) return;
    const tagsArray = Array.isArray(tagify.value)
        ? tagify.value.map(tagData => (typeof tagData === 'object' && tagData !== null ? tagData.value : tagData)).filter(Boolean)
        : [];
    const uniqueTags = Array.from(new Set(tagsArray.map(t => String(t).trim()).filter(Boolean)));
    localStorage.removeItem('item_tags');
    localStorage.setItem('item_tags', JSON.stringify(uniqueTags));
}

function fetchDataAndLoadTags() {
    fetch("/api/tags")
        .then((response) => response.json())
        .then((TagData) => {
            if (!Array.isArray(TagData)) return;

            // Synchronize global tags array
            tags = TagData.map(item => item.tag).filter(Boolean);

            // Populate sort dropdown
            populateSortTagsMenu(TagData);
            if (typeof toggleSelectedTag === 'function') {
                toggleSelectedTag();
            }

            // Update Tagify whitelist
            if (typeof tagify !== 'undefined' && tagify.settings) {
                tagify.settings.whitelist = tags.map(tag => ({ value: tag }));
            }
        })
        .catch((error) => console.error("Error in fetchDataAndLoadTags:", error));
}

function loadTagsIntoTagify(tagsToLoad) {
    if (!tagify) return;
    tagify.removeAllTags();
    if (tagsToLoad) {
        const tagList = Array.isArray(tagsToLoad) ? tagsToLoad : [tagsToLoad];
        const cleaned = tagList
            .map(t => (typeof t === 'object' && t !== null ? t.value : t))
            .filter(t => t !== undefined && t !== null && String(t).trim().length > 0);
        if (cleaned.length > 0) {
            tagify.addTags(cleaned);
        }
    }
}

function removeAllTags() {
    tags = [];
}

function getItemTagsArray(itemElement) {
    if (!itemElement) return [];
    const raw = itemElement.dataset.tags;
    if (!raw || raw === 'null' || raw === 'undefined') return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(t => String(t).trim().toLowerCase()).filter(Boolean);
        }
        if (typeof parsed === 'string') {
            return parsed.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        }
    } catch (e) {
        const cleaned = raw.replace(/[\[\]'"`]/g, '');
        return cleaned.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    }
    return [];
}

function itemMatchesTagFilter(itemElement) {
    if (!filterTags || filterTags.length === 0) {
        return true;
    }
    const itemTags = getItemTagsArray(itemElement);
    if (tagFilterMode === 'all') {
        return filterTags.every(ft => itemTags.includes(ft.toLowerCase()));
    } else {
        return filterTags.some(ft => itemTags.includes(ft.toLowerCase()));
    }
}

function getItemTagMatchScore(itemElement) {
    if (!filterTags || filterTags.length === 0 || !itemElement) return 0;
    const itemTags = getItemTagsArray(itemElement);
    let matchCount = 0;
    filterTags.forEach(ft => {
        if (itemTags.includes(ft.toLowerCase())) {
            matchCount++;
        }
    });
    return matchCount;
}

function compareItemsBySortMethod(a, b) {
    if (typeof currentSortMethod === 'undefined' || !currentSortMethod) {
        const idA = parseInt(a.dataset.id, 10) || 0;
        const idB = parseInt(b.dataset.id, 10) || 0;
        return idA - idB;
    }
    const modifier = (typeof currentSortDirection !== 'undefined' && currentSortDirection === 'desc') ? -1 : 1;
    let valA = a.dataset[currentSortMethod] ?? '';
    let valB = b.dataset[currentSortMethod] ?? '';

    if (currentSortMethod === 'quantity' || currentSortMethod === 'id') {
        const numA = parseInt(valA, 10) || 0;
        const numB = parseInt(valB, 10) || 0;
        if (numA !== numB) {
            return (numA - numB) * modifier;
        }
    } else if (currentSortMethod === 'position') {
        if (typeof parseItemPosition === 'function') {
            const posA = parseItemPosition(valA);
            const posB = parseItemPosition(valB);
            if (posA[0] !== posB[0]) return (posA[0] - posB[0]) * modifier;
            if (posA[1] !== posB[1]) return (posA[1] - posB[1]) * modifier;
        }
    } else {
        const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp * modifier;
    }

    const idA = parseInt(a.dataset.id, 10) || 0;
    const idB = parseInt(b.dataset.id, 10) || 0;
    return (idA - idB) * modifier;
}

function itemMatchesSearch(itemElement) {
    const searchInput = document.getElementById('search') || document.getElementById('search-input');
    if (!searchInput) return true;
    const searchText = (searchInput.value || '').toLowerCase().trim();
    if (!searchText) return true;
    const itemName = (itemElement.dataset["name"] || "").toLowerCase();
    const itemTags = (itemElement.dataset["tags"] || "").toLowerCase();
    const itemEsp = (itemElement.dataset["espName"] || "").toLowerCase();
    return itemName.indexOf(searchText) !== -1 || itemTags.indexOf(searchText) !== -1 || itemEsp.indexOf(searchText) !== -1;
}

function itemMatchesEspFilter(itemElement) {
    if (typeof filterESP === 'undefined' || !Array.isArray(filterESP) || filterESP.length === 0) {
        return true;
    }
    const itemESP = (itemElement.dataset.ip || '').toLowerCase();
    const itemEspName = (itemElement.dataset.espName || '').toLowerCase();
    return filterESP.some(filter => {
        const f = (filter || '').toLowerCase().trim();
        return f && (itemESP.includes(f) || itemEspName.includes(f));
    });
}

function applyItemFilters() {
    const itemsContainer = document.getElementById('items-container-grid');
    if (!itemsContainer) return;
    const items = Array.from(itemsContainer.children).filter(el => el.classList.contains('item-col') && !el.classList.contains('skeleton-col'));
    let visibleCount = 0;

    items.forEach((item) => {
        const matchesTags = itemMatchesTagFilter(item);
        const matchesSearch = itemMatchesSearch(item);
        const matchesEsp = itemMatchesEspFilter(item);
        if (matchesTags && matchesSearch && matchesEsp) {
            item.style.display = "flex";
            visibleCount++;
        } else {
            item.style.display = "none";
        }
    });

    // In 'any' mode with multiple selected tags, sort items so that
    // items with the most matching tags appear first in the grid
    if (filterTags.length > 1 && tagFilterMode === 'any') {
        const emptyState = document.getElementById('items-empty-state');
        items.sort((a, b) => {
            const scoreA = getItemTagMatchScore(a);
            const scoreB = getItemTagMatchScore(b);
            if (scoreB !== scoreA) {
                return scoreB - scoreA; // More matching tags first
            }
            return compareItemsBySortMethod(a, b);
        });

        items.forEach(item => {
            itemsContainer.appendChild(item);
        });
        if (emptyState) {
            itemsContainer.appendChild(emptyState);
        }
    } else if (filterTags.length === 0) {
        // When tags are cleared, re-apply the current sort method so standard order is preserved
        if (typeof sortItems === 'function' && typeof currentSortMethod !== 'undefined' && currentSortMethod) {
            sortItems(currentSortMethod, currentSortDirection);
        }
    }

    if (typeof updateEmptyState === 'function') {
        updateEmptyState(visibleCount, items.length);
    }

    updateTagFilterButtonBadge();
}

function setTagFilterMode(mode, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    tagFilterMode = (mode === 'all') ? 'all' : 'any';
    localStorage.setItem('tag_filter_mode', tagFilterMode);
    updateTagFilterModeUI();
    toggleSelectedTag();
    applyItemFilters();
}

function updateTagFilterModeUI() {
    const anyBtn = document.getElementById('tag-mode-any');
    const allBtn = document.getElementById('tag-mode-all');
    if (anyBtn && allBtn) {
        if (tagFilterMode === 'all') {
            allBtn.classList.add('active');
            anyBtn.classList.remove('active');
        } else {
            anyBtn.classList.add('active');
            allBtn.classList.remove('active');
        }
    }
}

function updateTagFilterButtonBadge() {
    const dropdownWrapper = document.getElementById('sortingBytags_text');
    if (!dropdownWrapper) return;
    const button = dropdownWrapper.querySelector('.dropdown-toggle');
    if (!button) return;

    let badge = button.querySelector('.tag-filter-badge');
    if (filterTags.length > 0) {
        button.classList.add('btn-primary');
        button.classList.remove('btn-outline-secondary');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'tag-filter-badge badge bg-danger rounded-pill ms-1';
            badge.style.fontSize = '0.65rem';
            button.appendChild(badge);
        }
        badge.textContent = filterTags.length;
    } else {
        button.classList.remove('btn-primary');
        button.classList.add('btn-outline-secondary');
        if (badge) {
            badge.remove();
        }
    }
}

function sortItemsByTag(filter) {
    if (filter === "") {
        filterTags = [];
    } else {
        if (!filterTags.includes(filter)) {
            filterTags.push(filter);
        } else {
            filterTags.splice(filterTags.indexOf(filter), 1);
        }
    }
    toggleSelectedTag();
    applyItemFilters();
}

function createSortMenuItem(text, onClickHandler, count) {
    const listItem = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.dataset.filter = text;
    anchor.classList.add('dropdown-item', 'd-flex', 'align-items-center', 'justify-content-between');
    anchor.href = '#';

    if (text === "Clear Tags") {
        anchor.innerHTML = '<span class="d-flex align-items-center"><span class="icon-n4px me-2"><i data-lucide="x"></i></span><span>Clear Tags</span></span>';
        anchor.classList.add('disabled');
        anchor.onclick = (e) => {
            e.preventDefault();
            onClickHandler();
        };
        listItem.appendChild(anchor);
        const div = document.createElement('div');
        div.classList.add('dropdown-divider', 'my-1');
        listItem.appendChild(div);
    } else {
        const safeText = (typeof escapeHtml === 'function') ? escapeHtml(text) : text;
        const isSelected = filterTags.includes(text);
        anchor.innerHTML = `
            <span class="d-flex align-items-center me-2 text-truncate">
                <i data-lucide="check" class="me-2 tag-check-icon ${isSelected ? '' : 'invisible'}" style="width: 14px; height: 14px;"></i>
                <span class="tag-name text-truncate">${safeText}</span>
            </span>
            <span class="tag-count text-muted small ms-2">(${count})</span>
        `;
        anchor.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClickHandler();
        };
        listItem.appendChild(anchor);
    }

    return listItem;
}

function populateSortTagsMenu(tagDataArray) {
    const sortTagsMenu = document.getElementById('sort_tags');
    if (!sortTagsMenu) return;

    sortTagsMenu.innerHTML = '';

    // Mode Toggle Container
    const modeLi = document.createElement('li');
    modeLi.className = 'px-3 py-2';
    modeLi.onclick = (e) => e.stopPropagation();

    const modeLabelText = (typeof translation !== 'undefined' && translation.tag_match_mode)
        ? translation.tag_match_mode
        : 'Match Mode';
    const anyText = (typeof translation !== 'undefined' && translation.tag_match_any)
        ? translation.tag_match_any
        : 'Any (OR)';
    const allText = (typeof translation !== 'undefined' && translation.tag_match_all)
        ? translation.tag_match_all
        : 'All (AND)';

    const safeModeLabel = (typeof escapeHtml === 'function') ? escapeHtml(modeLabelText) : modeLabelText;
    const safeAny = (typeof escapeHtml === 'function') ? escapeHtml(anyText) : anyText;
    const safeAll = (typeof escapeHtml === 'function') ? escapeHtml(allText) : allText;

    modeLi.innerHTML = `
        <div class="d-flex align-items-center justify-content-between mb-1">
            <small class="text-muted fw-bold">${safeModeLabel}</small>
        </div>
        <div class="btn-group btn-group-sm w-100" role="group" id="tag-filter-mode-group">
            <button type="button" class="btn btn-outline-secondary btn-sm ${tagFilterMode !== 'all' ? 'active' : ''}" id="tag-mode-any">
                ${safeAny}
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm ${tagFilterMode === 'all' ? 'active' : ''}" id="tag-mode-all">
                ${safeAll}
            </button>
        </div>
    `;

    const anyBtn = modeLi.querySelector('#tag-mode-any');
    const allBtn = modeLi.querySelector('#tag-mode-all');
    if (anyBtn) anyBtn.addEventListener('click', (e) => setTagFilterMode('any', e));
    if (allBtn) allBtn.addEventListener('click', (e) => setTagFilterMode('all', e));

    sortTagsMenu.appendChild(modeLi);

    // Divider
    const dividerLi = document.createElement('li');
    dividerLi.innerHTML = '<hr class="dropdown-divider my-1">';
    sortTagsMenu.appendChild(dividerLi);

    // Clear Tags menu item
    sortTagsMenu.appendChild(createSortMenuItem("Clear Tags", () => sortItemsByTag("")));

    // Create and append menu items for each tag
    tagDataArray.forEach(({ tag, count }) => {
        sortTagsMenu.appendChild(createSortMenuItem(tag, () => sortItemsByTag(tag), count));
    });

    if (window.lucide) {
        lucide.createIcons();
    }

    toggleSelectedTag();
}

function toggleSelectedTag() {
    if (!sortTagsDropdown) return;
    const listItems = Array.from(sortTagsDropdown.querySelectorAll('li'));

    listItems.forEach(li => {
        const anchor = li.querySelector('a');
        if (!anchor) return;
        const anchorText = anchor.getAttribute('data-filter');
        if (!anchorText) return;

        const checkIcon = anchor.querySelector('.tag-check-icon');

        if (filterTags.includes(anchorText) && anchorText !== "Clear Tags") {
            anchor.classList.add('active');
            if (checkIcon) checkIcon.classList.remove('invisible');
        } else {
            anchor.classList.remove('active');
            if (checkIcon) checkIcon.classList.add('invisible');
        }
        if (anchorText === "Clear Tags") {
            const shouldDisable = filterTags.length === 0;
            anchor.classList.toggle('disabled', shouldDisable);
        }
    });

    updateTagFilterButtonBadge();
}


fetchDataAndLoadTags();





