import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { SearchInput } from './components/SearchInput'
import { ProfileConfirmation } from './components/ProfileConfirmation'
import { ResultsTable } from './components/ResultsTable'
import { LoadingPipeline } from './components/LoadingPipeline'
import { EmptyState } from './components/EmptyState'
import { LeadDetailModal } from './components/LeadDetailModal'
import { fetchProfileExtraction, fetchHealth, fetchDiscovery } from './services/api'
import type { DiscoveryPhase } from './services/api'
import type { Lead, ViewState, StructuredProfile } from './types'
import { AlertCircle } from 'lucide-react'

const EMPTY_PROFILE: StructuredProfile = {
  audience_type: 'both',
  category: '',
  geography: '',
  target_company_size: '',
  target_consumer_segment: '',
  keywords: [],
  budget_scale_signal: '',
  summary: ''
}

export function App() {
  const [viewState, setViewState] = useState<ViewState>('landing')
  const [query, setQuery] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  
  // Phase 2 Profile extraction state
  const [profile, setProfile] = useState<StructuredProfile>(EMPTY_PROFILE)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [discoveryProgress, setDiscoveryProgress] = useState<{
    phase: DiscoveryPhase
    message: string
  }>({ phase: 'search', message: 'Preparing discovery search...' })
  const [meta, setMeta] = useState<{
    isLiveGroq?: boolean
    modelUsed?: string | null
    notice?: string | null
  }>({
    isLiveGroq: false,
    notice: 'Ready to extract profile from your real business description.'
  })

  // Phase 3 & 4 Discovery state (Tavily & Geoapify)
  const [discoveryMeta, setDiscoveryMeta] = useState<{
    audience?: string
    isLiveTavily?: boolean
    isLiveGeoapify?: boolean
    searchQuery?: string | null
    notice?: string | null
  } | undefined>(undefined)

  // Check backend health on mount
  useEffect(() => {
    fetchHealth()
      .then((res) => {
        if (res.config?.groqDiscoveryConfigured || res.config?.groqConfigured) {
          setMeta((prev) => ({
            ...prev,
            isLiveGroq: true,
            notice: 'GroqCloud API key detected in .env. Live extraction enabled.'
          }))
        }
      })
      .catch((err) => {
        console.warn('Backend health check warning:', err.message)
      })
  }, [])

  // Handle extraction trigger from Landing
  const handleExtractProfile = async () => {
    if (!query.trim()) return

    setIsExtracting(true)
    setExtractError(null)

    try {
      const response = await fetchProfileExtraction(query.trim())
      if (response.success && response.data) {
        setProfile(response.data)
        setMeta(response.meta)
        setViewState('confirm-profile')
      } else {
        throw new Error('Invalid extraction response from server')
      }
    } catch (err: unknown) {
      console.error('Profile extraction error:', err)
      const message = err instanceof Error ? err.message : 'Failed to connect to extraction server'
      setExtractError(message)
    } finally {
      setIsExtracting(false)
    }
  }

  // Handle confirmation of tweaked profile and launch Phase 3/4 discovery
  const handleProfileConfirmed = async (confirmedProfile: StructuredProfile) => {
    setProfile(confirmedProfile)
    setViewState('loading')
    setExtractError(null)
    setLeads([])
    setDiscoveryMeta(undefined)
    setDiscoveryProgress({ phase: 'search', message: 'Searching Tavily and Geoapify for candidates...' })

    try {
      const response = await fetchDiscovery(confirmedProfile, (progress) => {
        setDiscoveryProgress(progress)
      })
      if (!response.success || !response.data) {
        throw new Error('Invalid discovery response from server')
      }

      setLeads(response.data)
      setDiscoveryMeta({
        audience: confirmedProfile.audience_type,
        isLiveTavily: response.meta.isLiveTavily,
        isLiveGeoapify: response.meta.isLiveGeoapify,
        searchQuery: response.meta.searchQuery,
        notice: response.meta.notice
      })
    } catch (err: unknown) {
      console.error('Discovery error:', err)
      const message = err instanceof Error ? err.message : 'Discovery pipeline failed'
      setExtractError(`Discovery notice: ${message}`)
      setDiscoveryMeta({
        audience: confirmedProfile.audience_type,
        notice: `Discovery failed: ${message}`
      })
    } finally {
      setViewState('results')
    }
  }

  const handleReset = () => {
    setViewState('landing')
    setQuery('')
    setProfile(EMPTY_PROFILE)
    setLeads([])
    setSelectedLead(null)
    setExtractError(null)
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col text-zinc-900 selection:bg-zinc-900 selection:text-white">
      {/* Top Navigation */}
      <Header
        onReset={handleReset}
      />

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {extractError && (
          <div className="max-w-3xl mx-auto mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{extractError}</span>
            </div>
            <button
              onClick={() => setExtractError(null)}
              className="text-red-600 hover:text-red-900 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View 1: Landing Input */}
        {viewState === 'landing' && (
          <div className="py-6 sm:py-10 animate-in fade-in duration-200">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSubmit={handleExtractProfile}
              isLoading={isExtracting}
            />
          </div>
        )}

        {/* View 2: Phase 2 Confirm & Tweak Profile Step */}
        {viewState === 'confirm-profile' && (
          <div className="animate-in fade-in duration-200">
            <ProfileConfirmation
              initialProfile={profile}
              businessDescription={query}
              meta={meta}
              onConfirm={handleProfileConfirmed}
              onBack={() => setViewState('landing')}
              onReExtract={handleExtractProfile}
              isExtracting={isExtracting}
            />
          </div>
        )}

        {/* View 3: Loading Pipeline */}
        {viewState === 'loading' && (
          <div className="animate-in fade-in duration-200">
            <LoadingPipeline phase={discoveryProgress.phase} message={discoveryProgress.message} />
          </div>
        )}

        {/* View 4: Results Table */}
        {viewState === 'results' && (
          <div className="animate-in fade-in duration-200">
            <ResultsTable
              leads={leads}
              onSelectLead={setSelectedLead}
              onNewSearch={() => setViewState('landing')}
              discoveryMeta={discoveryMeta}
            />
          </div>
        )}

        {/* View 5: Empty State */}
        {viewState === 'empty' && (
          <div className="animate-in fade-in duration-200">
            <EmptyState
              onReset={() => setViewState('landing')}
              onTryExample={(sampleQuery) => {
                setQuery(sampleQuery)
                setViewState('loading')
              }}
            />
          </div>
        )}
      </main>

      {/* Lead Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />

      {/* Subtle Footer */}
      <footer className="border-t border-zinc-200/60 bg-white py-4 text-center text-xs text-zinc-600">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Client Finder — AI-Powered Lead Discovery Tool</span>
          <span className="text-[11px] text-zinc-600">
            Phase 4 Active · B2B (Tavily Web Search) & B2C (Geoapify Places) Discovery Engine
          </span>
        </div>
      </footer>
    </div>
  )
}

export default App
