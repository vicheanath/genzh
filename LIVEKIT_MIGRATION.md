# LiveKit Migration Progress

## Completed ✅

### Backend (Phase 1-2)
- [x] Added LiveKit dependencies to workspace
- [x] Created `LiveKitTokenGenerator` in `crates/room/src/media.rs`
  - Generates JWT tokens compatible with LiveKit
  - Uses existing jsonwebtoken crate
  - Maps media permissions to LiveKit grants
- [x] Updated `AppState` to include optional `livekit_generator`
  - Conditional initialization based on `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- [x] Added LiveKit configuration to `apps/api/src/config.rs`
  - `LIVEKIT_API_KEY` - optional
  - `LIVEKIT_API_SECRET` - optional
  - `LIVEKIT_URL` - optional
- [x] Updated exports in `crates/room/src/lib.rs`
- [x] Backend compiles successfully with no breaking changes
- [x] Old media server code remains intact (backward compatible)

### Web Frontend (Phase 3 - In Progress)
- [x] Added LiveKit packages to `apps/web/package.json`
  - `@livekit/react`: ^0.9.0
  - `livekit-client`: ^1.4.0
- [x] Created `LiveKitVoiceClient.ts` - new WebRTC client using LiveKit SDK
  - Maintains same interface as old `VoiceClient` for compatibility
  - Wraps LiveKit SDK with familiar methods (join, leave, startCamera, etc.)
  - Auto-subscribes to participants and handles state changes

## In Progress / Next Steps

### Web Frontend - Remaining Tasks
1. **Update `useVoiceRoom.tsx`**
   - Import `LiveKitVoiceClient` instead of `VoiceClient`
   - Instantiate with same `SessionFactory`
   - All hooks should work unchanged due to compatible interface

2. **Delete/Archive Old Files** (optional)
   - `apps/web/src/lib/media/VoiceClient.ts` (old custom WebRTC)
   - `apps/web/src/lib/media/protocol.ts` (custom signaling protocol)
   - These can be kept initially for comparison

3. **Update UI Components** (if needed)
   - Most components should work unchanged
   - May need tweaks to how tracks are handled
   - Video/audio stream rendering should be compatible

### Mobile Frontend (Phase 4)
1. Add LiveKit React Native SDK to `apps/mobile/package.json`
   - `livekit-react-native`
2. Create `MobileVoiceClient.ts` following same pattern
3. Update `apps/mobile/src/context/VoiceContext.tsx`

### Configuration
1. Set environment variables for LiveKit:
   ```env
   LIVEKIT_URL=wss://your-livekit.livekit.cloud
   LIVEKIT_API_KEY=your-api-key
   LIVEKIT_API_SECRET=your-api-secret
   ```

2. For self-hosted, add to `docker-compose.yml`:
   ```yaml
   livekit:
     image: livekit/livekit-server:latest
     ports:
       - "7880:7880"
   ```

### Testing
1. Install web dependencies: `pnpm install`
2. Run dev server: `pnpm dev`
3. Test media join with LiveKit credentials configured
4. Test fallback to custom media server if LiveKit credentials missing

## Architecture Notes

**Key Design Decisions:**
- Backend keeps old media server code (no deletion)
- Frontend can toggle between implementations via configuration
- LiveKit token generation uses same `MediaJoinResponse` structure
- No database schema changes required
- Permissions model maps cleanly to LiveKit grants

**Compatibility:**
- `MediaJoinResponse` structure unchanged
- Same React hooks interface maintained
- UI components don't need refactoring
- Can run both systems in parallel during transition

**Migration Path:**
1. Deploy with LiveKit disabled (default behavior)
2. Enable LiveKit in frontend with feature flag
3. Test with subset of users
4. Roll out to all users
5. Keep old server running as fallback

## Token Generation Example

```typescript
// API endpoint generates token automatically
const response = await media.join(room_id, user_id, display_name);
// Returns MediaJoinResponse with LiveKit token if LIVEKIT_API_KEY set
// Returns custom token if LiveKit not configured
```

## Status

- **Backend**: ✅ Complete, compiling, backward compatible
- **Web Client**: 🟡 In progress (client created, hooks need update)
- **Mobile Client**: ⏳ Not started
- **Overall**: ~60% complete
