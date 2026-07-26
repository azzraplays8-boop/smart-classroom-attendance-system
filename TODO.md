# UserMenu Redesign - TODO

## Steps

### Phase 1: CSS Foundation ✅
- [x] Create `frontend/src/components/UserMenu.css` with complete modern styling:
  - Glassmorphism dropdown (white bg, backdrop blur, border-radius 18px, shadow)
  - Top bar trigger styling (48x48 avatar, name/role layout, chevron)
  - Role badge colors (super_admin=purple, administrator=blue, teacher=green)
  - Menu item hover effects with rounded background
  - Fade/scale/slide-down animations (0.2-0.3s)
  - Responsive breakpoints for desktop/tablet/mobile
  - Safari `-webkit-user-select` compatibility

### Phase 2: Component Update ✅
- [x] Update `UserMenu.jsx`:
  - Redesigned trigger with 48x48 centered avatar, name, role, animated chevron
  - Dropdown with glassmorphism card, header (avatar, name, role badge, email)
  - Menu items: Profile, Account Settings, Security, Theme, Divider, Logout
  - Import new CSS file
  - Preserve all existing auth/navigation logic

### Phase 3: Verification
- [ ] Verify component renders correctly with all user roles
- [ ] Confirm no breaking changes to auth, routing, or backend

