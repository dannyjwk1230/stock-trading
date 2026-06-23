import { requireSupabase } from "./supabaseClient";

const USER_APP_STATE_TABLE = "user_app_state";

export async function loadUserAppState(userId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(USER_APP_STATE_TABLE)
    .select("nickname, execution_mode, favorite_groups, strategies_by_mode, orders_by_mode, records_by_mode, alerts_by_mode, settings, market_state, backtest_state")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveUserAppState(userId, appState) {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from(USER_APP_STATE_TABLE)
    .upsert(
      {
        user_id: userId,
        nickname: appState.nickname || null,
        execution_mode: appState.executionMode,
        favorite_groups: appState.favoriteGroups,
        strategies_by_mode: appState.strategiesByMode,
        orders_by_mode: appState.ordersByMode,
        records_by_mode: appState.recordsByMode,
        alerts_by_mode: appState.alertsByMode,
        settings: appState.settings,
        market_state: appState.marketState,
        backtest_state: appState.backtestState
      },
      { onConflict: "user_id" }
    );

  if (error) throw error;
}
