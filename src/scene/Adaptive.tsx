// Graphics quality: the same as the site always had (up to 2× resolution, ambient occlusion on wide screens), fixed for
// the whole session. Nothing switches quality while running: an automatic switch rebuilt every shader and render
// target mid-session and froze the page on an integrated GPU. `?q=low` gives 1× resolution and no ambient occlusion
// for a machine that needs it.

export const LOW_GPU = new URLSearchParams(location.search).get('q') === 'low';
export const MAX_DPR = LOW_GPU ? 1 : Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
