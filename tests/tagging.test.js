import { describe, expect, it, beforeEach } from 'vitest';
import { TAGS, TAG_CATEGORIES } from '../src/features/tagLibrary.js';
import { getTagById, getTagsByCategory, getAllTags, getTagCategories, addTag, removeTag, getTagsForDate } from '../src/features/tagging.js';
import { loadDismissedResiduals, saveDismissedResiduals, RESIDUAL_DISMISS_KEY } from '../src/utils/storage.js';

// Mock localStorage
let store = {};
const localStorageMock = {
  getItem: (key) => store[key] || null,
  setItem: (key, value) => {
    store[key] = value.toString();
  },
  removeItem: (key) => {
    delete store[key];
  },
  clear: () => {
    store = {};
  },
};

global.localStorage = localStorageMock;

describe('Tagging System', () => {
  beforeEach(() => {
    store = {};
  });

  describe('tagLibrary', () => {
    it('should export TAGS and TAG_CATEGORIES', () => {
      expect(TAGS).toBeInstanceOf(Array);
      expect(TAG_CATEGORIES).toBeInstanceOf(Object);
      expect(TAGS.length).toBeGreaterThan(0);
    });
  });

  describe('tagging.js', () => {
    it('should get a tag by ID', () => {
      const tag = getTagById('weather-rain');
      expect(tag).toEqual({ id: 'weather-rain', label: 'Rain', category: TAG_CATEGORIES.WEATHER });
      const invalidTag = getTagById('invalid-id');
      expect(invalidTag).toBeUndefined();
    });

    it('should get tags by category', () => {
      const weatherTags = getTagsByCategory(TAG_CATEGORIES.WEATHER);
      expect(weatherTags.length).toBe(4);
      expect(weatherTags[0].category).toBe(TAG_CATEGORIES.WEATHER);
    });

    it('should get all tags', () => {
      const allTags = getAllTags();
      expect(allTags.length).toBe(TAGS.length);
    });

    it('should get all tag categories', () => {
      const allCategories = getTagCategories();
      expect(allCategories).toEqual(TAG_CATEGORIES);
    });
  });

  describe('Tagging and Storage', () => {
    const isoDate = '2025-11-11';
    const tagId = 'workload-heavy-parcels';
    const tagId2 = 'weather-rain';

    it('should add a tag to a date', () => {
      addTag(isoDate, tagId, 60);
      const tags = getTagsForDate(isoDate);
      expect(tags.length).toBe(1);
      expect(tags[0].id).toBe(tagId);
      expect(tags[0].minutes).toBe(60);
    });

    it('should add multiple tags to a date', () => {
      addTag(isoDate, tagId, 60);
      addTag(isoDate, tagId2, 30);
      const tags = getTagsForDate(isoDate);
      expect(tags.length).toBe(2);
      expect(tags.find(t => t.id === tagId2).minutes).toBe(30);
    });

    it('should remove a tag from a date', () => {
      addTag(isoDate, tagId, 60);
      addTag(isoDate, tagId2, 30);
      removeTag(isoDate, tagId);
      const tags = getTagsForDate(isoDate);
      expect(tags.length).toBe(1);
      expect(tags[0].id).toBe(tagId2);
    });

    it('should remove the date entry if no tags are left', () => {
      addTag(isoDate, tagId, 60);
      removeTag(isoDate, tagId);
      const tags = getTagsForDate(isoDate);
      expect(tags.length).toBe(0);
      const allTaggedDates = loadDismissedResiduals();
      expect(allTaggedDates.find(entry => entry.iso === isoDate)).toBeUndefined();
    });

    it('should handle adding a tag with null minutes', () => {
      addTag(isoDate, tagId, null);
      const tags = getTagsForDate(isoDate);
      expect(tags.length).toBe(1);
      expect(tags[0].id).toBe(tagId);
      expect(tags[0].minutes).toBe(null);
    });

    it('should not fail when removing a non-existent tag', () => {
      addTag(isoDate, tagId, 60);
      removeTag(isoDate, 'non-existent-tag');
      const tags = getTagsForDate(isoDate);
      expect(tags.length).toBe(1);
    });

    it('should not fail when removing from a non-existent date', () => {
      removeTag('2025-11-12', tagId);
      const allTaggedDates = loadDismissedResiduals();
      expect(allTaggedDates.length).toBe(0);
    });
  });

  describe('storage.js backward compatibility', () => {
    it('should load old string-based reasons', () => {
      const oldData = [
        { iso: '2025-11-10', reason: 'Heavy Parcels', minutes: 45 },
        { iso: '2025-11-11', reason: 'Unknown Reason', minutes: 20 },
      ];
      localStorage.setItem(RESIDUAL_DISMISS_KEY, JSON.stringify(oldData));
      const residuals = loadDismissedResiduals();
      expect(residuals.length).toBe(2);
      const tags1 = residuals.find(r => r.iso === '2025-11-10').tags;
      expect(tags1[0].id).toBe('workload-heavy-parcels');
      expect(tags1[0].minutes).toBe(45);
      const tags2 = residuals.find(r => r.iso === '2025-11-11').tags;
      expect(tags2[0].id).toBe('custom-unknown-reason');
      expect(tags2[0].label).toBe('Unknown Reason');
      expect(tags2[0].minutes).toBe(20);
    });

    it('should handle invalid data in localStorage for loadDismissedResiduals', () => {
      localStorage.setItem(RESIDUAL_DISMISS_KEY, 'invalid-json');
      const residuals = loadDismissedResiduals();
      expect(residuals).toEqual([]);
    });

    it('should handle invalid data in localStorage for saveDismissedResiduals', () => {
      const invalidData = [{ iso: '2025-11-10' }]; // Missing tags array
      saveDismissedResiduals(invalidData);
      const residuals = loadDismissedResiduals();
      expect(residuals.length).toBe(0);
    });
  });
});
