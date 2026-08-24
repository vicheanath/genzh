import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  LinearTransition,
  runOnJS,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';

import { SPRING_GESTURE, SPRING_PANEL } from '../theme/motion';
import { Colors, Radius, Spacing } from '../theme/tokens';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  type: 'success' | 'error';
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How far sideways a toast has to be pushed before letting go dismisses it. */
const SWIPE_DISMISS_DISTANCE = 90;
const SWIPE_DISMISS_VELOCITY = 700;

/**
 * Transient confirmations.
 *
 * The app has a lot of small side effects — an invite copied, a message
 * deleted, a friend request sent — that are invisible if nothing says they
 * happened. A callout in the layout would push content around for two seconds;
 * a toast lives over it, so nothing reflows.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    // Clearing the timer matters when the toast was swiped away early:
    // otherwise it fires later against an id that is already gone.
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const add = useCallback(
    (type: ToastItem['type'], title: string, description?: string) => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, title, description, type }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3500),
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => add('success', title, description),
      error: (title, description) => add('error', title, description),
    }),
    [add],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();

  if (items.length === 0) return null;

  return (
    // `pointerEvents="box-none"` so the strip never eats taps meant for the
    // screen underneath — only the toasts themselves are touchable.
    <View
      pointerEvents="box-none"
      style={[styles.viewport, { top: insets.top + Spacing.sm }]}
    >
      {items.map((item) => (
        <ToastRow key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </View>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const shift = useSharedValue(0);
  const isError = item.type === 'error';

  // Flick it aside to get rid of it early — the gesture people already use on
  // every notification banner on the platform.
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      shift.value = event.translationX;
    })
    .onEnd((event) => {
      const gone =
        Math.abs(event.translationX) > SWIPE_DISMISS_DISTANCE ||
        Math.abs(event.velocityX) > SWIPE_DISMISS_VELOCITY;

      if (gone) {
        shift.value = withSpring(
          Math.sign(event.translationX || event.velocityX) * 500,
          { ...SPRING_GESTURE, velocity: event.velocityX },
          () => {
            runOnJS(onDismiss)();
          },
        );
        return;
      }

      shift.value = withSpring(0, SPRING_PANEL);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: shift.value }],
    // Fading with the distance means a half-committed swipe reads as
    // "this is going" rather than as a toast that merely slid sideways.
    opacity: 1 - Math.min(Math.abs(shift.value) / 260, 0.85),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        // The stack re-flows when one in the middle leaves; `LinearTransition`
        // slides the survivors into their new places instead of snapping.
        layout={LinearTransition.springify().damping(20).stiffness(220)}
        entering={ZoomIn.springify().damping(18).stiffness(240)}
        exiting={SlideOutUp.duration(180)}
        style={[styles.toast, isError && styles.toastError, style]}
      >
        <View style={[styles.icon, isError && styles.iconError]}>
          {isError ? (
            <X size={13} color={Colors.danger} strokeWidth={3} />
          ) : (
            <Check size={13} color={Colors.accent} strokeWidth={3} />
          )}
        </View>

        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.description ? (
            <Text style={styles.description} numberOfLines={3}>
              {item.description}
            </Text>
          ) : null}
        </View>

        <Text style={styles.hint}>Swipe</Text>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * The app's toast vocabulary.
 *
 * Two verbs rather than a free-form `add`, because every toast in this app is
 * either "that worked" or "that did not".
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used within a ToastProvider');
  return api;
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    gap: Spacing.sm,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastError: {
    borderColor: Colors.danger,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconError: {
    backgroundColor: Colors.dangerSubtle,
  },
  text: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  description: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  hint: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
