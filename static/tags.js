const input = document.getElementById('item_tags');
const maxSelectedTags  = 10
const sortTagsDropdown = document.getElementById('sort_tags');
let tags = [];
let filterTags = [];
let tagFilterMode = localStorage.getItem('tag_filter_mode') || 'any';
const tagify = new Tagify(input, {
    whitelist: [],
    dropdown: {
        enabled: 0,
        appendTarget: document.getElementById('item-modal') || document.body
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

let tagSortOrder = localStorage.getItem('tag_sort_order') || 'alpha'; // 'alpha' (A-Z) by default or 'count'
let tagMenuSearchQuery = '';
let tagDataCache = [];

function setTagSortOrder(order, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    tagSortOrder = (order === 'count') ? 'count' : 'alpha';
    localStorage.setItem('tag_sort_order', tagSortOrder);
    populateSortTagsMenu(tagDataCache);
}

function updateTagSearchQuery(query) {
    tagMenuSearchQuery = query || '';
    if (localStorage.getItem('remember_tag_search') === 'true') {
        localStorage.setItem('saved_tag_search_query', tagMenuSearchQuery);
    }
    filterTagMenuItems();
}

function filterTagMenuItems() {
    const sortTagsMenu = document.getElementById('sort_tags');
    if (!sortTagsMenu) return;
    const query = tagMenuSearchQuery.trim().toLowerCase();
    const items = sortTagsMenu.querySelectorAll('.tag-menu-item');
    const emptyNotice = sortTagsMenu.querySelector('.tag-menu-empty');
    let matchCount = 0;

    items.forEach(li => {
        const anchor = li.querySelector('a');
        const text = (anchor ? anchor.getAttribute('data-filter') : '') || '';
        if (!query || text.toLowerCase().includes(query)) {
            li.classList.remove('d-none');
            matchCount++;
        } else {
            li.classList.add('d-none');
        }
    });

    if (emptyNotice) {
        if (matchCount === 0 && items.length > 0) {
            emptyNotice.classList.remove('d-none');
        } else {
            emptyNotice.classList.add('d-none');
        }
    }

    const clearBtn = document.getElementById('dropdown-tag-search-clear');
    if (clearBtn) {
        clearBtn.classList.toggle('d-none', !query);
    }
}

function fetchDataAndLoadTags() {
    fetch("/api/tags")
        .then((response) => response.json())
        .then((TagData) => {
            if (!Array.isArray(TagData)) return;

            // Synchronize global tags array
            tags = TagData.map(item => item.tag).filter(Boolean);

            // Restore saved filter tags & search query if Remember is enabled
            if (localStorage.getItem('remember_tag_search') === 'true') {
                try {
                    const savedTags = JSON.parse(localStorage.getItem('saved_filter_tags') || '[]');
                    if (Array.isArray(savedTags)) {
                        filterTags = savedTags.filter(t => tags.includes(t));
                    }
                    tagMenuSearchQuery = localStorage.getItem('saved_tag_search_query') || '';
                } catch (e) {
                    console.error('Error loading saved tag filters:', e);
                }
            }

            // Populate sort dropdown
            populateSortTagsMenu(TagData);
            if (typeof toggleSelectedTag === 'function') {
                toggleSelectedTag();
            }
            if (filterTags.length > 0 && typeof applyItemFilters === 'function') {
                applyItemFilters();
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
    if (localStorage.getItem('remember_tag_search') === 'true') {
        localStorage.setItem('saved_filter_tags', JSON.stringify(filterTags));
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

    return listItem;
}

function populateSortTagsMenu(tagDataArray) {
    const sortTagsMenu = document.getElementById('sort_tags');
    if (!sortTagsMenu) return;

    if (Array.isArray(tagDataArray)) {
        tagDataCache = tagDataArray;
    } else {
        tagDataArray = tagDataCache;
    }

    sortTagsMenu.innerHTML = '';

    // 1. Sticky Tag Search Input Header
    const searchLi = document.createElement('li');
    searchLi.className = 'px-3 pt-2 pb-1';
    searchLi.onclick = (e) => e.stopPropagation();
    searchLi.innerHTML = `
        <div class="input-group input-group-sm">
            <span class="input-group-text bg-body-tertiary border-end-0 py-0 px-2"><i data-lucide="search" style="width: 14px; height: 14px;"></i></span>
            <input type="text" class="form-control border-start-0 ps-1 py-1" id="dropdown-tag-search-input" placeholder="Search tags..." value="${typeof escapeHtml === 'function' ? escapeHtml(tagMenuSearchQuery) : tagMenuSearchQuery}" style="font-size: 0.8rem;">
            <button class="btn btn-outline-secondary py-0 px-2 ${tagMenuSearchQuery ? '' : 'd-none'}" type="button" id="dropdown-tag-search-clear"><i data-lucide="x" style="width: 12px; height: 12px;"></i></button>
        </div>
    `;
    sortTagsMenu.appendChild(searchLi);

    const searchInput = searchLi.querySelector('#dropdown-tag-search-input');
    const searchClear = searchLi.querySelector('#dropdown-tag-search-clear');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => updateTagSearchQuery(e.target.value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                updateTagSearchQuery('');
                if (searchInput) searchInput.value = '';
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const firstVisible = sortTagsMenu.querySelector('.tag-menu-item:not(.d-none) a');
                if (firstVisible) {
                    const tagVal = firstVisible.getAttribute('data-filter');
                    if (tagVal) sortItemsByTag(tagVal);
                }
            }
        });
    }

    if (searchClear) {
        searchClear.addEventListener('click', (e) => {
            e.stopPropagation();
            updateTagSearchQuery('');
            if (searchInput) searchInput.value = '';
        });
    }

    // 2. Controls Header: Match Mode & Sort Order
    const controlsLi = document.createElement('li');
    controlsLi.className = 'px-3 py-1';
    controlsLi.onclick = (e) => e.stopPropagation();

    const anyText = (typeof translation !== 'undefined' && translation.tag_match_any) ? translation.tag_match_any : 'Any';
    const allText = (typeof translation !== 'undefined' && translation.tag_match_all) ? translation.tag_match_all : 'All';

    controlsLi.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2">
            <div class="d-flex align-items-center gap-1">
                <small class="text-muted fw-bold" style="font-size:0.72rem;">Match:</small>
                <div class="btn-group btn-group-sm" role="group" id="tag-filter-mode-group">
                    <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1.5 ${tagFilterMode !== 'all' ? 'active' : ''}" id="tag-mode-any" style="font-size: 0.7rem;">${anyText}</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1.5 ${tagFilterMode === 'all' ? 'active' : ''}" id="tag-mode-all" style="font-size: 0.7rem;">${allText}</button>
                </div>
            </div>
            <div class="d-flex align-items-center gap-1">
                <small class="text-muted fw-bold" style="font-size:0.72rem;">Order:</small>
                <div class="btn-group btn-group-sm" role="group" id="tag-sort-order-group">
                    <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1.5 ${tagSortOrder === 'alpha' ? 'active' : ''}" id="tag-sort-alpha" style="font-size: 0.7rem;" title="Alphabetical A-Z">A–Z</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-1.5 ${tagSortOrder === 'count' ? 'active' : ''}" id="tag-sort-count" style="font-size: 0.7rem;" title="By usage count">Count</button>
                </div>
            </div>
        </div>
    `;

    const anyBtn = controlsLi.querySelector('#tag-mode-any');
    const allBtn = controlsLi.querySelector('#tag-mode-all');
    const alphaBtn = controlsLi.querySelector('#tag-sort-alpha');
    const countBtn = controlsLi.querySelector('#tag-sort-count');

    if (anyBtn) anyBtn.addEventListener('click', (e) => setTagFilterMode('any', e));
    if (allBtn) allBtn.addEventListener('click', (e) => setTagFilterMode('all', e));
    if (alphaBtn) alphaBtn.addEventListener('click', (e) => setTagSortOrder('alpha', e));
    if (countBtn) countBtn.addEventListener('click', (e) => setTagSortOrder('count', e));

    sortTagsMenu.appendChild(controlsLi);

    // 3. Clear Tags & Remember Toggle Row
    const actionLi = document.createElement('li');
    actionLi.className = 'px-3 py-1 border-bottom mb-1';
    actionLi.onclick = (e) => e.stopPropagation();

    const isRemembered = localStorage.getItem('remember_tag_search') === 'true';

    actionLi.innerHTML = `
        <div class="d-flex align-items-center justify-content-between">
            <a class="text-danger text-decoration-none small d-inline-flex align-items-center cursor-pointer ${filterTags.length === 0 ? 'disabled opacity-50' : ''}" id="clear-tags-action-btn" href="#" style="font-size: 0.78rem;">
                <i data-lucide="x" class="me-1" style="width: 12px; height: 12px;"></i>
                <span>Clear Tags</span>
            </a>
            <div class="form-check form-switch mb-0 d-inline-flex align-items-center" data-bs-toggle="tooltip" title="Remember active tags and search across page reloads">
                <input class="form-check-input cursor-pointer me-1" type="checkbox" role="switch" id="remember-tag-search-toggle" ${isRemembered ? 'checked' : ''} style="width: 1.8em; height: 0.9em;">
                <label class="form-check-label small text-muted cursor-pointer mb-0" for="remember-tag-search-toggle" style="font-size: 0.72rem;">Remember</label>
            </div>
        </div>
    `;

    const clearBtn = actionLi.querySelector('#clear-tags-action-btn');
    const rememberToggle = actionLi.querySelector('#remember-tag-search-toggle');

    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (filterTags.length > 0) {
                sortItemsByTag("");
            }
        });
    }

    if (rememberToggle) {
        rememberToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('remember_tag_search', isChecked ? 'true' : 'false');
            if (isChecked) {
                localStorage.setItem('saved_filter_tags', JSON.stringify(filterTags));
                localStorage.setItem('saved_tag_search_query', tagMenuSearchQuery);
            } else {
                localStorage.removeItem('saved_filter_tags');
                localStorage.removeItem('saved_tag_search_query');
            }
        });
    }

    sortTagsMenu.appendChild(actionLi);

    // 4. Sort tag list by chosen order (Default 'alpha' = A-Z)
    const sortedTags = [...tagDataArray];
    if (tagSortOrder === 'alpha') {
        sortedTags.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base', numeric: true }));
    } else {
        sortedTags.sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));
    }

    // 5. Append Tag Items
    sortedTags.forEach(({ tag, count }) => {
        const item = createSortMenuItem(tag, () => sortItemsByTag(tag), count);
        item.classList.add('tag-menu-item');
        sortTagsMenu.appendChild(item);
    });

    // 6. Add empty search notice container
    const emptyLi = document.createElement('li');
    emptyLi.className = 'px-3 py-2 text-muted small text-center tag-menu-empty d-none';
    emptyLi.textContent = 'No matching tags found';
    sortTagsMenu.appendChild(emptyLi);

    if (window.lucide) {
        lucide.createIcons();
    }

    toggleSelectedTag();
    filterTagMenuItems();
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





