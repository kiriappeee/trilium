import utils from "./utils.js";
import treeCache from "./tree_cache.js";
import ws from "./ws.js";
import hoistedNoteService from "./hoisted_note.js";

async function prepareRootNode() {
    await treeCache.initializedPromise;

    const hoistedNoteId = hoistedNoteService.getHoistedNoteId();

    let hoistedBranch;

    if (hoistedNoteId === 'root') {
        hoistedBranch = treeCache.getBranch('root');
    }
    else {
        const hoistedNote = await treeCache.getNote(hoistedNoteId);
        hoistedBranch = (await hoistedNote.getBranches())[0];
    }

    return await prepareNode(hoistedBranch);
}

async function prepareChildren(note) {
    if (note.type === 'search') {
        return await prepareSearchNoteChildren(note);
    }
    else {
        return await prepareNormalNoteChildren(note);
    }
}

const NOTE_TYPE_ICONS = {
    "file": "bx bx-file",
    "image": "bx bx-image",
    "code": "bx bx-code",
    "render": "bx bx-extension",
    "search": "bx bx-file-find",
    "relation-map": "bx bx-map-alt",
    "book": "bx bx-book"
};

function getIconClass(note) {
    const labels = note.getLabels('iconClass');

    return labels.map(l => l.value).join(' ');
}

function getIcon(note) {
    const hoistedNoteId = hoistedNoteService.getHoistedNoteId();

    const iconClass = getIconClass(note);

    if (iconClass) {
        return iconClass;
    }
    else if (note.noteId === 'root') {
        return "bx bx-chevrons-right";
    }
    else if (note.noteId === hoistedNoteId) {
        return "bx bxs-arrow-from-bottom";
    }
    else if (note.type === 'text') {
        if (note.hasChildren()) {
            return "bx bx-folder";
        }
        else {
            return "bx bx-note";
        }
    }
    else {
        return NOTE_TYPE_ICONS[note.type];
    }
}

async function prepareNode(branch) {
    const note = await branch.getNote();

    if (!note) {
        throw new Error(`Branch has no note ` + branch.noteId);
    }

    const title = (branch.prefix ? (branch.prefix + " - ") : "") + note.title;
    const hoistedNoteId = hoistedNoteService.getHoistedNoteId();

    const node = {
        noteId: note.noteId,
        parentNoteId: branch.parentNoteId,
        branchId: branch.branchId,
        isProtected: note.isProtected,
        noteType: note.type,
        title: utils.escapeHtml(title),
        extraClasses: getExtraClasses(note),
        icon: getIcon(note),
        refKey: note.noteId,
        expanded: branch.isExpanded || hoistedNoteId === note.noteId,
        key: utils.randomString(12) // this should prevent some "duplicate key" errors
    };

    const childBranches = getChildBranchesWithoutImages(note);

    node.folder = childBranches.length > 0
               || note.type === 'search'

    node.lazy = node.folder && !node.expanded;

    if (node.folder && node.expanded) {
        node.children = await prepareChildren(note);
    }

    return node;
}

async function prepareNormalNoteChildren(parentNote) {
    utils.assertArguments(parentNote);

    const noteList = [];

    for (const branch of getChildBranchesWithoutImages(parentNote)) {
        const node = await prepareNode(branch);

        noteList.push(node);
    }

    return noteList;
}

function getChildBranchesWithoutImages(parentNote) {
    const childBranches = parentNote.getChildBranches();

    if (!childBranches) {
        ws.logError(`No children for ${parentNote}. This shouldn't happen.`);
        return;
    }

    const imageLinks = parentNote.getRelations('imageLink');

    // image is already visible in the parent note so no need to display it separately in the book
    return childBranches.filter(branch => !imageLinks.find(rel => rel.value === branch.noteId));
}

async function prepareSearchNoteChildren(note) {
    await treeCache.reloadNotes([note.noteId]);

    const newNote = await treeCache.getNote(note.noteId);

    return await prepareNormalNoteChildren(newNote);
}

function getExtraClasses(note) {
    utils.assertArguments(note);

    const extraClasses = [];

    if (note.isProtected) {
        extraClasses.push("protected");
    }

    if (note.getParentNoteIds().length > 1) {
        extraClasses.push("multiple-parents");
    }

    const cssClass = note.getCssClass();

    if (cssClass) {
        extraClasses.push(cssClass);
    }

    extraClasses.push(utils.getNoteTypeClass(note.type));

    if (note.mime) { // some notes should not have mime type (e.g. render)
        extraClasses.push(utils.getMimeTypeClass(note.mime));
    }

    if (note.hasLabel('archived')) {
        extraClasses.push("archived");
    }

    return extraClasses.join(" ");
}

export default {
    prepareRootNode,
    prepareBranch: prepareChildren,
    getExtraClasses,
    getIcon,
    getChildBranchesWithoutImages
}