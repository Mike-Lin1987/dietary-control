export {
  addFavorite,
  deleteFavorite,
  getAllFavorites,
  getFavoriteById,
  updateFavorite,
} from './storage.js';

export function startFavoritesSync() { return Promise.resolve(); }
export function stopFavoritesSync() {}
export function setOnFavoritesChanged() {}
export function clearFavoritesCache() {}
