# 101 Okey Implementation Plan - UI First

## 1. UI Foundation
- [ ] Create basic HTML structure with a 4-player layout.
- [ ] Implement a rich, green felt table background using CSS gradients and textures.
- [ ] Design the "Table Center" grid where players will place their opened sets (perler).
- [ ] Design the "User Rack" (Istaka) at the bottom with two rows for tiles.
- [ ] Add slots for Bot-1 (Left), Bot-2 (Top), and Bot-3 (Right) with avatars and status indicators.

## 2. Component Design (CSS)
- [ ] **Tiles**: Create a reusable CSS component for Okey tiles (white background, rounded corners, colored numbers).
- [ ] **Buttons**: Create high-quality, glowing buttons for "Seri Aç", "Çift Aç", "İşle", etc.
- [ ] **Scoreboards**: Small floating panels near each player.
- [ ] **Discard/Draw Piles**: Visual representations of the center stack and discarded tiles.

## 3. Basic Interactions (Visual Only)
- [ ] Drag and drop support for tiles on the rack.
- [ ] Visual feedback for selecting tiles.
- [ ] Animations for drawing and throwing tiles.

## 4. Game Logic (Next Phase)
- [ ] Tile deck generation (106 tiles).
- [ ] Shuffling and distribution logic.
- [ ] Sequence (Seri) and Pair (Çift) validation.
- [ ] 101 point threshold calculation.
- [ ] Bot AI behaviors.

---
**Current Focus**: UI Layout and Design.
