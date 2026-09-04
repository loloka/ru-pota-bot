/**
 * RU-POTA Mini App Internationalization (i18n) Dictionary
 */

export const translations = {
  RU: {
    // Navigation
    nav_dashboard: 'Главная',
    nav_cluster: 'В эфире',
    nav_map: 'Карта',
    nav_subscriptions: 'Подписки',
    nav_profile: 'Профиль',

    // Header
    header_title: 'RU-POTA',
    header_subtitle: 'Parks on the Air',
    header_menu_community: 'Чат сообщества RU-POTA',
    header_menu_site: 'Официальный портал POTA.app',
    header_menu_rules: 'Правила активации парков',
    header_notifications_title: 'Уведомления',
    header_no_notifications: 'Нет новых уведомлений',

    // Dashboard
    dash_hello: 'Привет',
    dash_operator: 'Оператор',
    dash_cabinet: 'Кабинет',
    dash_approved: 'Активатор',
    dash_pending: 'На проверке',
    dash_guest: 'Гость',
    dash_no_callsign: 'БЕЗ ПОЗЫВНОГО',
    guest_badge: 'Гостевой режим',
    guest_welcome: 'RU-POTA Hub 🌲',
    guest_subtitle: 'Просмотр спотов кластера и карты',
    guest_login_btn: 'Войти через бота',
    guest_open_bot: 'Открыть в Telegram',
    guest_profile_title: 'Личный кабинет оператора',
    guest_profile_desc: 'Для привязки позывного, персональной статистики и отправки спотов запустите RU-POTA Hub в Telegram.',
    guest_subs_title: 'Персональные подписки',
    guest_subs_desc: 'Бот мгновенно уведомит вас в Telegram о выходе любимых активаторов и парков в эфир.',
    guest_stats_hint: 'Доступно в Telegram-боте',
    guest_subs_hint: 'Доступно в Telegram-боте',
    dash_on_air: 'В ЭФИРЕ (ON AIR)',
    dash_session_active: 'Сессия активна',
    dash_respot: 'Респот в эфир',
    dash_qrt: 'Завершить (QRT)',
    dash_not_on_air_title: 'Вы сейчас не в эфире',
    dash_not_on_air_desc: 'Работаете в парке? Отправьте спот, чтобы охотники мгновенно узнали о вас!',
    dash_send_spot_btn: '+ Отправить спот в эфир',
    dash_spot_locked_guest: '🔒 Требуется регистрация позывного',
    dash_spot_locked_pending: '⏳ Позывной на проверке',
    dash_spot_locked_rejected: '❌ Заявка отклонена',
    dash_live_ru: 'В эфире (RU / СНГ)',
    dash_live_world: 'В эфире (Мир POTA)',
    dash_ru_quiet: 'RU затишье',
    dash_see_all: 'Смотреть все',
    dash_quiet_notice: 'В данный момент на диапазонах затишье. Будьте первыми!',
    dash_my_stats: 'Моя статистика',
    dash_activations: 'Активаций:',
    dash_unique_parks: 'Парков:',
    dash_qsos: 'QSO:',
    dash_my_subs: 'Мои подписки',
    dash_total_subs: 'Всего подписок:',
    dash_dm_alerts: 'Алерты в ЛС:',
    dash_status: 'Статус:',
    dash_enabled: 'Вкл',
    dash_active: 'Активно',

    // Cluster
    cluster_ru_only: '🇷🇺 Только RU / СНГ',
    cluster_world: '🌐 Весь мир',
    cluster_search_ph: 'Поиск по позывному, парку (RU-0073)...',
    cluster_all: 'Все',
    cluster_found: 'Найдено спотов:',
    cluster_autorefresh: 'Автообновление: 20с',
    cluster_connecting: 'Подключение к кластеру POTA...',
    cluster_not_found: 'Спотов не найдено',
    cluster_reset_filters: 'Попробуйте сбросить фильтры диапазонов или строку поиска',
    cluster_ru_quiet_title: 'В эфире RU/СНГ сейчас затишье',
    cluster_ru_quiet_desc: 'В данный момент в домашнем регионе нет активных активаций. Переключитесь на эфир мира, чтобы увидеть активные станции POTA!',
    cluster_show_world_btn: '🌐 Показать станции мира (POTA World)',
    cluster_follow_btn: 'Следить',
    cluster_on_map_btn: 'На карте',
    cluster_by: 'от',

    // Map
    map_active_filter: 'В эфире',
    map_all_filter: 'Все парки',
    map_find_me: 'Мое местоположение',
    map_sheet_park: 'Заповедник POTA',
    map_sheet_activator: 'Активатор в эфире:',
    map_sheet_route: 'Построить маршрут',
    map_sheet_close: 'Закрыть',

    // Subscriptions
    subs_dm_title: 'Уведомления в Telegram',
    subs_dm_desc: 'Мгновенные алерты в ЛС от бота',
    subs_callsigns_tab: 'Позывные',
    subs_parks_tab: 'Парки',
    subs_input_callsign_ph: 'Введите позывной (R9OGL)...',
    subs_input_park_ph: 'Номер парка (RU-0073)...',
    subs_follow_btn: 'Следить',
    subs_loading: 'Загрузка подписок...',
    subs_empty_callsigns: 'Нет подписок на позывные',
    subs_empty_callsigns_sub: 'Добавьте позывной друга, чтобы не пропустить его споты в парках',
    subs_empty_parks: 'Нет подписок на парки',
    subs_empty_parks_sub: 'Подпишитесь на любимые заповедники для охоты за дипломами',
    subs_operator: 'Оператор POTA',

    // Profile
    profile_stat_title: 'Статистика POTA',
    profile_activator_title: 'Активатор (Activator)',
    profile_hunter_title: 'Охотник (Hunter)',
    profile_hunted_parks: 'Сработано парков:',
    profile_dxcc_count: 'Стран DXCC:',
    profile_confirmed_qsos: 'Подтверждено QSO:',
    profile_settings_title: 'Настройки приложения',
    profile_haptics_title: 'Тактильный отклик (Haptics)',
    profile_haptics_desc: 'Вибрация при тапах и переключении',
    profile_community_title: 'Поддержка и сообщество',
    profile_community_desc: 'Задать вопрос в группе RU-POTA',
    profile_change_callsign: 'Сменить',
    profile_set_callsign: 'Указать',

    // Spot Modal
    modal_spot_title: '📡 Выход в эфир (Спот)',
    modal_park_label: 'Номер парка (POTA Reference)',
    modal_freq_label: 'Частота (кГц / МГц)',
    modal_mode_label: 'Модуляция',
    modal_comment_label: 'Комментарий (необязательно)',
    modal_comment_ph: 'CQ POTA, антенна Inv V, 50W',
    modal_publish_btn: 'Опубликовать спот',
    modal_publishing: 'Публикация спота...',
  },

  EN: {
    // Navigation
    nav_dashboard: 'Dashboard',
    nav_cluster: 'On Air',
    nav_map: 'Map',
    nav_subscriptions: 'Alerts',
    nav_profile: 'Profile',

    // Header
    header_title: 'RU-POTA',
    header_subtitle: 'Parks on the Air',
    header_menu_community: 'RU-POTA Community Chat',
    header_menu_site: 'Official POTA.app Portal',
    header_menu_rules: 'Park Activation Rules',
    header_notifications_title: 'Notifications',
    header_no_notifications: 'No new notifications',

    // Dashboard
    dash_hello: 'Hello',
    dash_operator: 'Operator',
    dash_cabinet: 'Profile',
    dash_approved: 'Activator',
    dash_pending: 'Pending',
    dash_guest: 'Guest',
    dash_no_callsign: 'NO CALLSIGN',
    guest_badge: 'Guest Mode',
    guest_welcome: 'RU-POTA Hub 🌲',
    guest_subtitle: 'Live cluster spots and parks map',
    guest_login_btn: 'Login via Bot',
    guest_open_bot: 'Open in Telegram',
    guest_profile_title: 'Operator Profile',
    guest_profile_desc: 'To link your callsign, track personal stats and post spots, launch RU-POTA Hub in Telegram.',
    guest_subs_title: 'Personal Subscriptions',
    guest_subs_desc: 'Receive instant Telegram alerts when your favourite activators and parks go on air.',
    guest_stats_hint: 'Available in Telegram bot',
    guest_subs_hint: 'Available in Telegram bot',
    dash_on_air: '● ON AIR',
    dash_session_active: 'Active session',
    dash_respot: 'Respot on air',
    dash_qrt: 'Finish (QRT)',
    dash_not_on_air_title: 'You are currently off air',
    dash_not_on_air_desc: 'Operating from a park? Send a spot so hunters can find you right away!',
    dash_send_spot_btn: '+ Spot Yourself Now',
    dash_spot_locked_guest: '🔒 Callsign Required',
    dash_spot_locked_pending: '⏳ Callsign Pending Review',
    dash_spot_locked_rejected: '❌ Application Rejected',
    dash_live_ru: 'On Air (RU / CIS)',
    dash_live_world: 'On Air (POTA World)',
    dash_ru_quiet: 'RU Quiet',
    dash_see_all: 'View all',
    dash_quiet_notice: 'Bands are currently quiet. Be the first to spot!',
    dash_my_stats: 'My Statistics',
    dash_activations: 'Activations:',
    dash_unique_parks: 'Parks:',
    dash_qsos: 'QSOs:',
    dash_my_subs: 'My Subscriptions',
    dash_total_subs: 'Total alerts:',
    dash_dm_alerts: 'DM Alerts:',
    dash_status: 'Status:',
    dash_enabled: 'On',
    dash_active: 'Active',

    // Cluster
    cluster_ru_only: '🇷🇺 RU / CIS Only',
    cluster_world: '🌐 Whole World',
    cluster_search_ph: 'Search by callsign, park (RU-0073)...',
    cluster_all: 'All',
    cluster_found: 'Spots found:',
    cluster_autorefresh: 'Auto-refresh: 20s',
    cluster_connecting: 'Connecting to POTA cluster...',
    cluster_not_found: 'No spots found',
    cluster_reset_filters: 'Try clearing band filters or search query',
    cluster_ru_quiet_title: 'RU / CIS Region is currently quiet',
    cluster_ru_quiet_desc: 'Currently no active activations in the home region. Switch to world feed to see global POTA stations!',
    cluster_show_world_btn: '🌐 Show World Stations (POTA World)',
    cluster_follow_btn: 'Follow',
    cluster_on_map_btn: 'On Map',
    cluster_by: 'by',

    // Map
    map_active_filter: 'On Air',
    map_all_filter: 'All Parks',
    map_find_me: 'My Location',
    map_sheet_park: 'POTA Nature Reserve',
    map_sheet_activator: 'On-air Activator:',
    map_sheet_route: 'Directions / Route',
    map_sheet_close: 'Close',

    // Subscriptions
    subs_dm_title: 'Telegram Notifications',
    subs_dm_desc: 'Instant direct message alerts from bot',
    subs_callsigns_tab: 'Callsigns',
    subs_parks_tab: 'Parks',
    subs_input_callsign_ph: 'Enter callsign (R9OGL)...',
    subs_input_park_ph: 'Enter park reference (RU-0073)...',
    subs_follow_btn: 'Track',
    subs_loading: 'Loading subscriptions...',
    subs_empty_callsigns: 'No callsign subscriptions',
    subs_empty_callsigns_sub: 'Follow your friends to never miss their park activations',
    subs_empty_parks: 'No park subscriptions',
    subs_empty_parks_sub: 'Subscribe to your favorite reserves for award hunting',
    subs_operator: 'POTA Operator',

    // Profile
    profile_stat_title: 'POTA Statistics',
    profile_activator_title: 'Activator',
    profile_hunter_title: 'Hunter',
    profile_hunted_parks: 'Worked Parks:',
    profile_dxcc_count: 'DXCC Entities:',
    profile_confirmed_qsos: 'Confirmed QSOs:',
    profile_settings_title: 'App Settings',
    profile_haptics_title: 'Haptic Feedback',
    profile_haptics_desc: 'Vibration on taps and switches',
    profile_community_title: 'Support & Community',
    profile_community_desc: 'Ask questions in RU-POTA group',
    profile_change_callsign: 'Change',
    profile_set_callsign: 'Set',

    // Spot Modal
    modal_spot_title: '📡 Spot Activation (On Air)',
    modal_park_label: 'Park Number (POTA Reference)',
    modal_freq_label: 'Frequency (kHz / MHz)',
    modal_mode_label: 'Operating Mode',
    modal_comment_label: 'Comment (optional)',
    modal_comment_ph: 'CQ POTA, Inv V antenna, 50W',
    modal_publish_btn: 'Broadcast Spot',
    modal_publishing: 'Publishing spot...',
  }
};

/**
 * Get translation string by key and language
 * @param {string} lang 'RU' | 'EN'
 * @param {string} key
 * @returns {string}
 */
export function getTranslation(lang = 'RU', key) {
  const dictionary = translations[lang] || translations.RU;
  return dictionary[key] || translations.RU[key] || key;
}

/**
 * Format relative time in localized text
 */
export function formatTimeAgoLocale(diffMinutes, fallbackStr = '', lang = 'RU') {
  if (diffMinutes === undefined || diffMinutes === null || isNaN(diffMinutes)) return fallbackStr;
  if (diffMinutes <= 1) return lang === 'RU' ? 'только что' : 'just now';
  if (diffMinutes < 60) return lang === 'RU' ? `${diffMinutes} мин назад` : `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return lang === 'RU' ? `${hours} ч назад` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === 'RU' ? `${days} д назад` : `${days}d ago`;
}

