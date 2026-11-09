import type { Rect } from './entityVisuals'
import { snapImageAnchor } from './imageItems'
import { currentGrid } from '@/store/gridStore'

/** `snapImageAnchor` on the picture grid in force (set with a right-click on the grid snapping button). */
export const snapPicture = (bounds: Rect, rawX: number, rawY: number): { x: number; y: number } => snapImageAnchor(bounds, rawX, rawY, currentGrid())
