# Match District Android App - Comprehensive Architecture Plan

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Architecture Pattern](#3-architecture-pattern)
4. [Project Structure](#4-project-structure)
5. [Feature Mapping](#5-feature-mapping)
6. [API Integration Layer](#6-api-integration-layer)
7. [Authentication System](#7-authentication-system)
8. [Navigation Architecture](#8-navigation-architecture)
9. [UI/Design System](#9-uidesign-system)
10. [State Management](#10-state-management)
11. [Database & Caching](#11-database--caching)
12. [Screen Specifications](#12-screen-specifications)
13. [Implementation Phases](#13-implementation-phases)
14. [Build Configuration](#14-build-configuration)

---

## 1. Project Overview

### What We're Building
A native Android application for Match District that provides full feature parity with the existing web platform. The app will be built using Kotlin and Jetpack Compose for a modern, performant, and maintainable codebase.

### Key Goals
- **Full Feature Parity**: All 23 web pages translated to native Android screens
- **Performance**: Native performance with optimized memory and battery usage
- **Offline Support**: Core features work with limited connectivity
- **Push Notifications**: Real-time alerts for tournament updates
- **Material Design 3**: Modern Android design language with Match District branding

### Backend
- **Reuse existing Node.js/Supabase backend**
- Base URL: `https://matchdistrict.in/api`
- All 68+ existing API endpoints remain unchanged
- JWT token authentication (same as web)

---

## 2. Tech Stack & Dependencies

### Core
| Technology | Version | Purpose |
|---|---|---|
| **Kotlin** | 2.0+ | Primary language |
| **Jetpack Compose** | BOM 2024+ | Modern declarative UI |
| **Material 3** | Latest | Material Design components |
| **Kotlin Coroutines** | 1.8+ | Asynchronous operations |
| **Flow** | Kotlinx | Reactive data streams |

### Architecture
| Technology | Purpose |
|---|---|
| **Hilt** | Dependency injection |
| **Navigation Compose** | Type-safe navigation |
| **Compose Lifecycle** | Lifecycle-aware components |
| **ViewModel** | UI state management |

### Networking
| Technology | Purpose |
|---|---|
| **Retrofit** | HTTP client |
| **OkHttp** | HTTP engine + interceptors |
| **Gson** | JSON serialization |
| **Coil** | Image loading (Compose) |

### Storage
| Technology | Purpose |
|---|---|
| **Room** | Local database caching |
| **DataStore** | Secure preferences (tokens) |
| **EncryptedSharedPreferences** | Sensitive data storage |

### Additional
| Technology | Purpose |
|---|---|
| **Firebase Cloud Messaging** | Push notifications |
| **CameraX** | Camera for payment screenshots |
| **Accompanist** | Compose utilities (permissions, system bars) |

---

## 3. Architecture Pattern

### Clean Architecture + MVVM

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                     │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Compose UI (Screens, Components)               │    │
│  │  ViewModels (UI State, User Actions)            │    │
│  │  UI Models (UiState, UiEvent)                   │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│                      Domain Layer                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Use Cases (Business Logic)                     │    │
│  │  Domain Models                                  │    │
│  │  Repository Interfaces                          │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│                       Data Layer                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Repository Implementations                     │    │
│  │  Remote Data Sources (Retrofit)                 │    │
│  │  Local Data Sources (Room, DataStore)           │    │
│  │  Data Mappers                                   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Key Principles
- **Unidirectional Data Flow**: UI → ViewModel → UseCase → Repository
- **Single Source of Truth**: Room database as local cache
- **Offline-First**: Cache data, sync when online
- **Separation of Concerns**: Each layer has distinct responsibilities

---

## 4. Project Structure

### Module Organization
```
MatchDistrict/
├── app/                          # Main application module
│   ├── src/main/java/com/matchdistrict/app/
│   │   ├── MatchDistrictApp.kt          # Application class
│   │   ├── MainActivity.kt              # Single activity
│   │   └── di/                          # Hilt modules
│   │       ├── AppModule.kt
│   │       ├── NetworkModule.kt
│   │       ├── DatabaseModule.kt
│   │       └── RepositoryModule.kt
│   └── src/main/res/
│
├── core/                         # Core utilities
│   └── src/main/java/com/matchdistrict/core/
│       ├── network/                      # API client, interceptors
│       │   ├── ApiClient.kt
│       │   ├── AuthInterceptor.kt
│       │   ├── ApiService.kt
│       │   └── NetworkResult.kt
│       ├── database/                     # Room database
│       │   ├── AppDatabase.kt
│       │   ├── dao/
│       │   └── entities/
│       ├── security/                     # Encryption, tokens
│       │   ├── TokenManager.kt
│       │   ├── SessionManager.kt
│       │   └── CryptoUtils.kt
│       ├── util/                         # Extensions, helpers
│       │   ├── DateUtils.kt
│       │   ├── ValidationUtils.kt
│       │   └── ImageUtils.kt
│       └── designsystem/                 # Theme, colors, typography
│           ├── Theme.kt
│           ├── Color.kt
│           ├── Typography.kt
│           └── Components.kt
│
├── feature/                      # Feature modules
│   ├── auth/                             # Authentication
│   │   └── src/main/java/com/matchdistrict/feature/auth/
│   │       ├── login/
│   │       ├── register/
│   │       ├── otp/
│   │       └── forgotpassword/
│   │
│   ├── home/                             # Homepage
│   │   └── src/main/java/com/matchdistrict/feature/home/
│   │
│   ├── tournaments/                      # Tournament features
│   │   └── src/main/java/com/matchdistrict/feature/tournaments/
│   │       ├── list/                     # Tournament browsing
│   │       ├── detail/                   # Tournament details
│   │       ├── registration/             # Team registration
│   │       └── management/               # Organizer tournament mgmt
│   │
│   ├── profile/                          # User profile
│   │   └── src/main/java/com/matchdistrict/feature/profile/
│   │
│   ├── organizer/                        # Organizer features
│   │   └── src/main/java/com/matchdistrict/feature/organizer/
│   │       ├── dashboard/
│   │       ├── create/                   # 9-step wizard
│   │       ├── analytics/
│   │       └── settings/
│   │
│   ├── admin/                            # Admin features
│   │   └── src/main/java/com/matchdistrict/feature/admin/
│   │       ├── dashboard/
│   │       ├── users/
│   │       ├── payments/
│   │       └── settings/
│   │
│   ├── subscription/                     # Subscription & payments
│   │   └── src/main/java/com/matchdistrict/feature/subscription/
│   │       ├── plans/
│   │       ├── payment/
│   │       └── history/
│   │
│   └── notifications/                    # Alerts & notifications
│       └── src/main/java/com/matchdistrict/feature/notifications/
│
├── domain/                       # Domain layer
│   └── src/main/java/com/matchdistrict/domain/
│       ├── model/                        # Domain models
│       ├── repository/                   # Repository interfaces
│       └── usecase/                      # Use cases
│
└── data/                         # Data layer
    └── src/main/java/com/matchdistrict/data/
        ├── repository/                   # Repository implementations
        ├── remote/                       # API models, mappers
        ├── local/                        # Room DAOs, entities
        └── mapper/                       # Data ↔ Domain mappers
```

---

## 5. Feature Mapping

### Web → Android Screen Mapping

| Web Page (JSX) | Android Screen | Priority |
|---|---|---|
| `Homepage.jsx` | `HomeScreen` | P0 |
| `Tournaments.jsx` | `TournamentsScreen` | P0 |
| `TournamentDetail.jsx` | `TournamentDetailScreen` | P0 |
| `RegistrationPage.jsx` | `RegistrationScreen` | P0 |
| `Auth.jsx` (login) | `LoginScreen` | P0 |
| `Auth.jsx` (register) | `RegisterScreen` | P0 |
| `Profile.jsx` | `ProfileScreen` | P0 |
| `MyTournaments.jsx` | `MyTournamentsScreen` | P0 |
| `BecomeOrganizer.jsx` | `BecomeOrganizerScreen` | P1 |
| `CreateTournament.jsx` | `CreateTournamentScreen` | P1 |
| `OrganizerDashboard.jsx` | `OrganizerDashboardScreen` | P1 |
| `OrganizationManagement.jsx` | `OrganizationManagementScreen` | P1 |
| `TournamentManagement.jsx` | `TournamentManagementScreen` | P1 |
| `SubscriptionPayment.jsx` | `SubscriptionPaymentScreen` | P1 |
| `PaymentHistory.jsx` | `PaymentHistoryScreen` | P1 |
| `AdminDashboard.jsx` | `AdminDashboardScreen` | P2 |
| `AdminPayments.jsx` | `AdminPaymentsScreen` | P2 |
| `ExploreOrganisers.jsx` | `ExploreOrganisersScreen` | P2 |
| `OrgPage.jsx` | `OrgPageScreen` | P2 |
| `About.jsx` | `AboutScreen` | P3 |
| `HelpSupport.jsx` | `HelpSupportScreen` | P3 |
| `PrivacyPolicy.jsx` | `PrivacyPolicyScreen` | P3 |
| `TermsService.jsx` | `TermsServiceScreen` | P3 |

### Feature Modules Detail

#### 1. Auth Module
- **Login Screen**: Email/username + password, Google OAuth, remembered accounts
- **Register Screen**: 3-step flow (details → OTP → complete)
- **OTP Verification**: 6-digit code input with countdown
- **Forgot Password**: Email → reset link → new password
- **Session Management**: JWT token storage, auto-refresh

#### 2. Home Module
- **Hero Banner**: ViewPager2 carousel (10s auto-advance)
- **Featured Tournaments**: Horizontal LazyRow with wallet pass cards
- **Live Matches**: Real-time tournament cards with LIVE badge
- **Top Organizations**: Organization carousel
- **Global Footer**: Terms, Privacy, Support links

#### 3. Tournaments Module
- **List Screen**: Grid/list view toggle, filters, search
- **Detail Screen**: Full tournament info, tabs (Overview, Rules, Roadmap, Chat)
- **Registration Screen**: Team form with validation
- **Management Screen**: Organizer tournament CRUD

#### 4. Profile Module
- **Profile Screen**: Banner, avatar, bio, social links
- **Edit Profile**: Drawer with form fields
- **Game IDs**: BGMI, Valorant, CODM, Free Fire, CS2
- **Settings**: Theme, notifications, account

#### 5. Organizer Module
- **Dashboard**: Overview with stats, quick actions
- **Create Tournament**: 9-step wizard (same as web)
- **Analytics**: Charts with real data
- **Staff Management**: Invite, manage staff
- **Sponsor Management**: Request, track sponsors

#### 6. Admin Module
- **Dashboard**: Platform stats, activity feed
- **User Management**: Search, filter, delete
- **Payment Management**: Approve/reject subscriptions
- **KYC Management**: Organizer verification
- **Settings**: Theme, abuse filter, feature flags

#### 7. Subscription Module
- **Plans Screen**: Free/Basic/Pro comparison
- **Payment Screen**: UPI QR + screenshot upload
- **History Screen**: Payment records with status

---

## 6. API Integration Layer

### API Service Interface
```kotlin
// All endpoints from server.js mapped to Retrofit

interface MatchDistrictApi {

    // === Auth ===
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): ApiResponse<LoginResponse>

    @POST("auth/register-temp")
    suspend fun registerTemp(@Body request: RegisterTempRequest): ApiResponse<Unit>

    @POST("auth/send-otp")
    suspend fun sendOtp(@Body request: SendOtpRequest): ApiResponse<Unit>

    @POST("auth/verify-otp")
    suspend fun verifyOtp(@Body request: VerifyOtpRequest): ApiResponse<OtpResponse>

    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): ApiResponse<RegisterResponse>

    @GET("auth/me")
    suspend fun getCurrentUser(): ApiResponse<User>

    @POST("auth/restore-session")
    suspend fun restoreSession(@Body request: RestoreSessionRequest): ApiResponse<SessionResponse>

    // === Tournaments ===
    @GET("tournaments")
    suspend fun getTournaments(
        @Query("game") game: String? = null,
        @Query("status") status: String? = null,
        @Query("featured") featured: Boolean? = null
    ): ApiResponse<List<Tournament>>

    @GET("tournaments/{id}")
    suspend fun getTournament(@Path("id") id: String): ApiResponse<Tournament>

    @POST("tournaments/{id}/register")
    suspend fun registerForTournament(
        @Path("id") id: String,
        @Body request: RegistrationRequest
    ): ApiResponse<RegistrationResponse>

    // === Subscriptions ===
    @GET("subscription/my")
    suspend fun getMySubscription(): ApiResponse<SubscriptionResponse>

    @POST("subscription/upgrade")
    suspend fun upgradePlan(@Body request: UpgradeRequest): ApiResponse<Unit>

    // === Admin ===
    @GET("admin/dashboard")
    suspend fun getAdminDashboard(): ApiResponse<AdminDashboard>

    @GET("admin/users")
    suspend fun getAdminUsers(): ApiResponse<List<User>>

    // === ... all 68+ endpoints ===
}
```

### Network Configuration
```kotlin
// Base URL from BuildConfig
@Provides
@Singleton
fun provideRetrofit(tokenManager: TokenManager): Retrofit {
    return Retrofit.Builder()
        .baseUrl(BuildConfig.BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
}

// Auth interceptor adds JWT token
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenManager.getAccessToken()
        val request = chain.request().newBuilder().apply {
            token?.let { addHeader("Authorization", "Bearer $it") }
        }.build()
        return chain.proceed(request)
    }
}
```

---

## 7. Authentication System

### Token Management
```kotlin
class TokenManager @Inject constructor(
    private val dataStore: DataStore<Preferences>
) {
    companion object {
        private val ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        private val USER_ID = stringPreferencesKey("user_id")
    }

    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        dataStore.edit { prefs ->
            prefs[ACCESS_TOKEN] = accessToken
            prefs[REFRESH_TOKEN] = refreshToken
        }
    }

    suspend fun getAccessToken(): String? {
        return dataStore.data.first()[ACCESS_TOKEN]
    }

    suspend fun clearTokens() {
        dataStore.edit { it.clear() }
    }
}
```

### Session Flow
1. **App Launch** → Check DataStore for tokens
2. **Tokens Exist** → Call `/api/auth/restore-session` with encrypted session
3. **Valid Session** → Navigate to Home
4. **Invalid/No Session** → Navigate to Login
5. **Login Success** → Save tokens, navigate to Home
6. **Token Expires** → Auto-refresh or redirect to Login

### Google OAuth (Future)
- Use Google Sign-In SDK
- On success, call Supabase OAuth endpoint
- Store session tokens

---

## 8. Navigation Architecture

### Navigation Graph
```kotlin
sealed class Screen(val route: String) {
    // Auth
    object Login : Screen("login")
    object Register : Screen("register")
    object OtpVerification : Screen("otp/{email}")
    object ForgotPassword : Screen("forgot-password")

    // Main
    object Home : Screen("home")
    object Tournaments : Screen("tournaments")
    object TournamentDetail : Screen("tournaments/{id}")
    object Registration : Screen("tournaments/{id}/register")

    // Profile
    object Profile : Screen("profile")
    object EditProfile : Screen("edit-profile")
    object MyTournaments : Screen("my-tournaments")

    // Organizer
    object BecomeOrganizer : Screen("become-organizer")
    object CreateTournament : Screen("create-tournament")
    object OrganizerDashboard : Screen("organizer-dashboard")
    object TournamentManagement : Screen("tournament-management")

    // Admin
    object AdminDashboard : Screen("admin/dashboard")
    object AdminUsers : Screen("admin/users")
    object AdminPayments : Screen("admin/payments")

    // Subscription
    object SubscriptionPlans : Screen("subscription/plans")
    object SubscriptionPayment : Screen("subscription/payment")
    object PaymentHistory : Screen("subscription/history")

    // Info
    object About : Screen("about")
    object HelpSupport : Screen("help-support")
    object PrivacyPolicy : Screen("privacy-policy")
    object Terms : Screen("terms")
}
```

### Bottom Navigation (Main Screen)
```kotlin
// 4 main tabs + profile
enum class BottomNavItem(val screen: Screen, val icon: ImageVector, val label: String) {
    Home(Screen.Home, Icons.Default.Home, "Home"),
    Tournaments(Screen.Tournaments, Icons.Default.EmojiEvents, "Tournaments"),
    MyTournaments(Screen.MyTournaments, Icons.Default.List, "My Tournaments"),
    Profile(Screen.Profile, Icons.Default.Person, "Profile")
}
```

### Navigation Type Safety
```kotlin
// Using Compose Navigation with type-safe arguments
NavHost(navController = navController, startDestination = Screen.Home.route) {
    composable(Screen.Home.route) { HomeScreen(...) }
    composable(
        route = Screen.TournamentDetail.route,
        arguments = listOf(navArgument("id") { type = NavType.StringType })
    ) { backStackEntry ->
        val id = backStackEntry.arguments?.getString("id")
        TournamentDetailScreen(tournamentId = id, ...)
    }
    // ... other routes
}
```

---

## 9. UI/Design System

### Custom Hybrid Theme
Blend Match District's "Premium Light" aesthetic with Material 3:

```kotlin
// Match District Color Palette
object MatchDistrictColors {
    // Dark Mode (Default)
    val DarkBackground = Color(0xFF0B1020)       // #0B1020
    val DarkSurface = Color(0xFF111827)          // #111827
    val DarkSurfaceVariant = Color(0xFF1F2937)   // #1F2937

    // Light Mode
    val LightBackground = Color(0xFFF8FAFC)      // #F8FAFC
    val LightSurface = Color(0xFFFFFFFF)         // #FFFFFF
    val LightSurfaceVariant = Color(0xFFF1F5F9)  // #F1F5F9

    // Primary Brand Blue
    val PrimaryDark = Color(0xFF3B82F6)          // #3B82F6
    val PrimaryLight = Color(0xFF2563EB)         // #2563EB

    // Accent Colors
    val Gold = Color(0xFFFBBF24)                 // Pro badge
    val Success = Color(0xFF22C55E)              // Approved, live
    val Warning = Color(0xFFF59E0B)              // Pending
    val Error = Color(0xFFEF4444)                // Rejected
}
```

### Typography
```kotlin
object MatchDistrictTypography {
    val HeadlineLarge = TextStyle(
        fontSize = 28.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.5).sp
    )
    val HeadlineMedium = TextStyle(
        fontSize = 22.sp,
        fontWeight = FontWeight.SemiBold
    )
    val BodyLarge = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.Normal
    )
    val LabelMedium = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium
    )
}
```

### Reusable Components
```kotlin
// Glass Card (from web's .glass-card)
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.55f)
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 8.dp
        )
    ) { content() }
}

// Tournament Card (Wallet Pass style)
@Composable
fun TournamentWalletCard(
    tournament: Tournament,
    onClick: () -> Unit
) {
    // 3D layered card with leather sleeve metaphor
    // Same visual design as TournamentCard.jsx
}

// Game Badge
@Composable
fun GameBadge(game: String) {
    val colors = mapOf(
        "BGMI" to Color(0xFFF97316),    // Orange
        "Valorant" to Color(0xFFEF4444), // Red
        "CODM" to Color(0xFFF97316),     // Orange
        "Free Fire" to Color(0xFFF97316),// Orange
        "CS2" to Color(0xFF3B82F6)       // Blue
    )
    // Badge chip with game name
}

// Verification Badge
@Composable
fun VerificationBadge(tier: String, size: Dp = 16.dp) {
    if (tier == "Pro") {
        Icon(
            imageVector = Icons.Default.Star,
            tint = Color(0xFFFBBF24), // Gold
            modifier = Modifier.size(size)
        )
    }
}
```

---

## 10. State Management

### ViewModel Pattern
```kotlin
@HiltViewModel
class TournamentsViewModel @Inject constructor(
    private val getTournamentsUseCase: GetTournamentsUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow<TournamentsUiState>(TournamentsUiState.Loading)
    val uiState: StateFlow<TournamentsUiState> = _uiState.asStateFlow()

    private val _filters = MutableStateFlow(TournamentFilters())
    val filters: StateFlow<TournamentFilters> = _filters.asStateFlow()

    init {
        loadTournaments()
    }

    fun loadTournaments() {
        viewModelScope.launch {
            _uiState.value = TournamentsUiState.Loading
            getTournamentsUseCase(filters.value)
                .onSuccess { tournaments ->
                    _uiState.value = TournamentsUiState.Success(tournaments)
                }
                .onFailure { error ->
                    _uiState.value = TournamentsUiState.Error(error.message)
                }
        }
    }

    fun updateFilters(newFilters: TournamentFilters) {
        _filters.value = newFilters
        loadTournaments()
    }
}

sealed class TournamentsUiState {
    object Loading : TournamentsUiState()
    data class Success(val tournaments: List<Tournament>) : TournamentsUiState()
    data class Error(val message: String?) : TournamentsUiState()
}
```

---

## 11. Database & Caching

### Room Database
```kotlin
@Database(
    entities = [
        TournamentEntity::class,
        UserEntity::class,
        RegistrationEntity::class
    ],
    version = 1
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun tournamentDao(): TournamentDao
    abstract fun userDao(): UserDao
    abstract fun registrationDao(): RegistrationDao
}

// Cache strategy: Cache-Then-Network
@Singleton
class TournamentRepositoryImpl @Inject constructor(
    private val api: MatchDistrictApi,
    private val tournamentDao: TournamentDao
) : TournamentRepository {

    override fun getTournaments(): Flow<List<Tournament>> = flow {
        // Emit cached data first
        val cached = tournamentDao.getAll().map { it.toDomain() }
        emit(cached)

        // Fetch fresh data
        try {
            val remote = api.getTournaments()
            tournamentDao.insertAll(remote.data.map { it.toEntity() })
            emit(remote.data.map { it.toDomain() })
        } catch (e: Exception) {
            // Use cached data on network error
        }
    }
}
```

---

## 12. Screen Specifications

### Home Screen
```
┌─────────────────────────────────────┐
│  Match District Logo    🔔  👤     │
├─────────────────────────────────────┤
│  Welcome to the District.          │
│  ┌─────────────────────────────┐   │
│  │  BGIS 2026                  │   │
│  │  PRIZE │ ENTRY │ STARTS     │   │
│  │           [CLAIM SLOTS]     │   │
│  └─────────────────────────────┘   │
│      ● ○                           │
├─────────────────────────────────────┤
│  Featured Tournaments               │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│  │    │ │    │ │    │ │    │     │
│  └────┘ └────┘ └────┘ └────┘     │
├─────────────────────────────────────┤
│  Live Now 🔴                        │
│  ┌────┐ ┌────┐ ┌────┐            │
│  │    │ │    │ │    │            │
│  └────┘ └────┘ └────┘            │
├─────────────────────────────────────┤
│  Top Organizations                  │
│  ┌────┐ ┌────┐ ┌────┐            │
│  │    │ │    │ │    │            │
│  └────┘ └────┘ └────┘            │
├─────────────────────────────────────┤
│  🏠     🏆     📋     👤        │
│  Home  Tourn  My    Profile        │
└─────────────────────────────────────┘
```

### Tournament Detail Screen
```
┌─────────────────────────────────────┐
│  ← Tournament Title                 │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │  Cover Image (3:4 ratio)    │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  Game Badge: BGMI                   │
│  Prize Pool: ₹10,000               │
│  Entry Fee: ₹100                   │
│  Slots: 45/100                     │
├─────────────────────────────────────┤
│  [Overview] [Rules] [Roadmap]      │
├─────────────────────────────────────┤
│  Overview content...                │
├─────────────────────────────────────┤
│  Organized by: Team Alpha ★        │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │     Register Now (₹100)     │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## 13. Implementation Phases

### Phase 1: Foundation (Weeks 1-3)
**Goal**: Project setup, authentication, and basic navigation

- [ ] Initialize Android project with Kotlin + Compose
- [ ] Set up Clean Architecture modules
- [ ] Implement Hilt dependency injection
- [ ] Create design system (theme, colors, typography)
- [ ] Build network layer (Retrofit, interceptors)
- [ ] Implement authentication (login, register, OTP)
- [ ] Set up navigation graph
- [ ] Create splash screen and onboarding

**Deliverable**: Working app with login/register flow

### Phase 2: Core Features (Weeks 4-6)
**Goal**: Tournament browsing and registration

- [ ] Home screen with hero banner
- [ ] Tournament list with filters
- [ ] Tournament detail screen
- [ ] Team registration form
- [ ] My Tournaments screen
- [ ] Profile screen (view)
- [ ] Profile editing
- [ ] Basic error handling and loading states

**Deliverable**: Players can browse and register for tournaments

### Phase 3: Organizer Features (Weeks 7-9)
**Goal**: Tournament creation and management

- [ ] Become Organizer flow
- [ ] Create Tournament 9-step wizard
- [ ] Tournament management screen
- [ ] Organizer dashboard
- [ ] Staff management
- [ ] Registration management (approve/reject)

**Deliverable**: Organizers can create and manage tournaments

### Phase 4: Payments & Subscriptions (Weeks 10-11)
**Goal**: Payment integration and subscription management

- [ ] Subscription plans screen
- [ ] UPI payment flow
- [ ] Payment screenshot upload
- [ ] Payment history
- [ ] Subscription management

**Deliverable**: Full payment flow working

### Phase 5: Admin Features (Weeks 12-13)
**Goal**: Admin dashboard and management

- [ ] Admin dashboard
- [ ] User management
- [ ] Payment management
- [ ] KYC verification
- [ ] Settings management

**Deliverable**: Admin can manage platform

### Phase 6: Polish & Release (Weeks 14-15)
**Goal**: Performance optimization and Play Store release

- [ ] Push notifications (FCM)
- [ ] Offline caching
- [ ] Performance optimization
- [ ] UI polish and animations
- [ ] Testing (unit, UI, integration)
- [ ] Play Store preparation
- [ ] Beta testing

**Deliverable**: Production-ready app on Play Store

---

## 14. Build Configuration

### build.gradle.kts (app)
```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.dagger.hilt.android")
    id("com.google.gms.google-services") // Firebase
}

android {
    namespace = "com.matchdistrict.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.matchdistrict.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        // API Configuration
        buildConfigField("String", "BASE_URL", "\"https://matchdistrict.in/api/\"")
        buildConfigField("String", "SUPABASE_URL", "\"${project.findProperty("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${project.findProperty("SUPABASE_ANON_KEY")}\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    // Compose
    val composeBom = platform("androidx.compose:compose-bom:2024.02.00")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // Hilt
    implementation("com.google.dagger:hilt-android:2.50")
    kapt("com.google.dagger:hilt-android-compiler:2.50")
    implementation("androidx.hilt:hilt-navigation-compose:1.1.0")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Image Loading
    implementation("io.coil-kt:coil-compose:2.5.0")

    // DataStore
    implementation("androidx.datastore:datastore-preferences:1.0.0")

    // Room
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")

    // CameraX (for payment screenshots)
    implementation("androidx.camera:camera-camera2:1.3.1")
    implementation("androidx.camera:camera-lifecycle:1.3.1")
    implementation("androidx.camera:camera-view:1.3.1")

    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:32.7.0"))
    implementation("com.google.firebase:firebase-messaging-ktx")
}
```

### ProGuard Rules
```
# Retrofit
-keepattributes Signature
-keepattributes Exceptions
-keepattributes *Annotation*

# Gson
-keep class com.matchdistrict.data.remote.models.** { *; }

# Room
-keep class * extends androidx.room.RoomDatabase
```

---

## Summary

This plan provides a comprehensive roadmap for building the Match District Android app with:

1. **Native Kotlin + Jetpack Compose** for best performance
2. **Clean Architecture** for maintainability
3. **Full feature parity** with the web platform
4. **Custom hybrid design** blending Match District branding with Material 3
5. **15-week implementation timeline** across 6 phases
6. **Reuses existing backend** without modifications

The app will deliver a premium native experience while maintaining visual consistency with the web platform's "Premium Light" design language.
