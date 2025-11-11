import { TAGS, TAG_CATEGORIES } from './tagLibrary.js';
import { loadDismissedResiduals, saveDismissedResiduals } from '../utils/storage.js';

/**
 * A map of tag IDs to tag objects for quick lookups.
 * @type {Map<string, object>}
 */
const TAG_MAP = new Map(TAGS.map(tag => [tag.id, tag]));

/**
 * Returns a tag object from the `TAGS` array by its ID.
 * @param {string} id The ID of the tag to retrieve.
 * @returns {object|undefined} The tag object, or undefined if not found.
 */
export function getTagById(id) {
  return TAG_MAP.get(id);
}

/**
 * Returns an array of tag objects from the `TAGS` array by category.
 * @param {string} category The category to filter by.
 * @returns {object[]} An array of tag objects.
 */
export function getTagsByCategory(category) {
  return TAGS.filter(tag => tag.category === category);
}

/**
 * Returns the `TAGS` array.
 * @returns {object[]} The array of all predefined tags.
 */
export function getAllTags() {
  return [...TAGS];
}

/**
 * Returns the `TAG_CATEGORIES` object.
 * @returns {object} The object of all tag categories.
 */
export function getTagCategories() {
    return { ...TAG_CATEGORIES };
}

/**
 * Adds a tag to a specific date.
 * @param {string} isoDate The ISO date string.
 * @param {string} tagId The ID of the tag to add.
 * @param {number|null} minutes The number of minutes associated with the tag.
 */
export function addTag(isoDate, tagId, minutes = null) {
  const allTaggedDates = loadDismissedResiduals();
  const dateEntry = allTaggedDates.find(entry => entry.iso === isoDate);

  if (dateEntry) {
    const existingTag = dateEntry.tags.find(tag => tag.id === tagId);
    if (existingTag) {
      existingTag.minutes = minutes;
      existingTag.notedAt = new Date().toISOString();
    } else {
      dateEntry.tags.push({ id: tagId, minutes, notedAt: new Date().toISOString() });
    }
  } else {
    allTaggedDates.push({
      iso: isoDate,
      tags: [{ id: tagId, minutes, notedAt: new Date().toISOString() }],
    });
  }

  saveDismissedResiduals(allTaggedDates);
}

/**
 * Removes a tag from a specific date.
 * @param {string} isoDate The ISO date string.
 * @param {string} tagId The ID of the tag to remove.
 */
export function removeTag(isoDate, tagId) {
  let allTaggedDates = loadDismissedResiduals();
  const dateEntry = allTaggedDates.find(entry => entry.iso === isoDate);

  if (dateEntry) {
    dateEntry.tags = dateEntry.tags.filter(tag => tag.id !== tagId);
    if (dateEntry.tags.length === 0) {
      allTaggedDates = allTaggedDates.filter(entry => entry.iso !== isoDate);
    }
  }

  saveDismissedResiduals(allTaggedDates);
}

/**
 * Retrieves all tags for a specific date.
 * @param {string} isoDate The ISO date string.
 * @returns {object[]} An array of tag objects for the given date.
 */
export function getTagsForDate(isoDate) {
  const allTaggedDates = loadDismissedResiduals();
  const dateEntry = allTaggedDates.find(entry => entry.iso === isoDate);
  return dateEntry ? dateEntry.tags : [];
}