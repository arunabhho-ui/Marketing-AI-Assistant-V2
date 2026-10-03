import { useState } from 'react'
import type { FC } from 'react'
import {
  Building2,
  Store,
  MapPin,
  Globe,
  ArrowUpDown,
  Search,
  Eye,
  Mail,
  Phone,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import type { Lead, FilterType } from '../types'

interface ResultsTableProps {
  leads: Lead[]
  onSelectLead: (lead: Lead) => void
  onNewSearch: () => void
  discoveryMeta?: {
    audience?: string
    isLiveTavily?: boolean
    isLiveGeoapify?: boolean
    searchQuery?: string | null
    notice?: string | null
  }
}

export const ResultsTable: FC<ResultsTableProps> = ({
  leads,
  onSelectLead,
  onNewSearch,
  discoveryMeta
}) => {
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'fitScore' | 'name'>('fitScore')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 5

  // Filter leads
  const filteredLeads = leads
    .filter((lead) => {
      if (filterType !== 'all' && lead.type !== filterType) return false
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return (
          lead.name.toLowerCase().includes(query) ||
          lead.company?.toLowerCase().includes(query) ||
          lead.location.toLowerCase().includes(query) ||
          lead.reason.toLowerCase().includes(query)
        )
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'fitScore') {
        return sortOrder === 'desc' ? b.fitScore - a.fitScore : a.fitScore - b.fitScore
      } else {
        return sortOrder === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)
      }
    })

  const totalPages = Math.ceil(filteredLeads.length / pageSize)
  const pageStart = (currentPage - 1) * pageSize
  const pageLeads = filteredLeads.slice(pageStart, pageStart + pageSize)
  const visiblePageNumbers: (number | 'ellipsis')[] = totalPages <= 5
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : [
        1,
        ...(currentPage > 3 ? ['ellipsis' as const] : []),
        ...Array.from(
          { length: Math.max(0, Math.min(totalPages - 1, currentPage + 1) - Math.max(2, currentPage - 1) + 1) },
          (_, index) => Math.max(2, currentPage - 1) + index
        ),
        ...(currentPage < totalPages - 2 ? ['ellipsis' as const] : []),
        totalPages
      ]

  const b2bCount = leads.filter((l) => l.type === 'B2B').length
  const b2cCount = leads.filter((l) => l.type === 'B2C').length
  const avgScore = Math.round(leads.reduce((sum, l) => sum + l.fitScore, 0) / (leads.length || 1))

  const toggleSort = (field: 'fitScore' | 'name') => {
    setCurrentPage(1)
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const downloadCsv = () => {
    const columns: { label: string; value: (lead: Lead) => unknown }[] = [
      { label: 'Name', value: (lead) => lead.name },
      { label: 'Organization', value: (lead) => lead.companyName || lead.company },
      { label: 'Type', value: (lead) => lead.type },
      { label: 'Title', value: (lead) => lead.title },
      { label: 'Phone', value: (lead) => lead.phone },
      { label: 'Email', value: (lead) => lead.email },
      { label: 'Location', value: (lead) => lead.location },
      { label: 'Address', value: (lead) => lead.address },
      { label: 'Website', value: (lead) => lead.website || lead.officialWebsite },
      { label: 'Source / Map Link', value: (lead) => lead.contactUrl },
      { label: 'Fit Score', value: (lead) => lead.fitScore },
      { label: 'Description / AI Rationale', value: (lead) => lead.reason },
      { label: 'Source Evidence', value: (lead) => lead.rawData?.content },
      { label: 'Industry', value: (lead) => lead.industry },
      { label: 'Company Size', value: (lead) => lead.employeeCount },
      { label: 'Tags', value: (lead) => lead.tags.join(', ') },
      { label: 'Contact Source', value: (lead) => lead.contactSource },
      { label: 'Phone Source', value: (lead) => lead.phoneSource },
      { label: 'Email Source', value: (lead) => lead.emailSource }
    ]
    const escapeCell = (value: unknown) => {
      const text = value == null ? '' : String(value)
      const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
      return `"${safeText.replace(/"/g, '""')}"`
    }
    const csv = [
      columns.map((column) => escapeCell(column.label)).join(','),
      ...leads.map((lead) => columns.map((column) => escapeCell(column.value(lead))).join(','))
    ].join('\r\n')
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const getScoreBadge = (score: number) => {
    let colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/80 ring-emerald-500/20'
    if (score < 85 && score >= 75) {
      colorClass = 'bg-indigo-50 text-indigo-700 border-indigo-200/80 ring-indigo-500/20'
    } else if (score < 75) {
      colorClass = 'bg-zinc-100 text-zinc-700 border-zinc-200/80 ring-zinc-500/20'
    }

    return (
      <div className="inline-flex items-center space-x-1.5">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold border ring-1 ${colorClass}`}
        >
          {score}
          <span className="text-[10px] font-normal text-zinc-400 ml-0.5">/100</span>
        </span>
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top action & metrics bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/80 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
              Discovered Prospects
            </h2>
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200/60">
              {leads.length} Leads
            </span>
            {discoveryMeta && (
              <div className="flex items-center space-x-1.5">
                {(discoveryMeta.audience === 'B2B' || discoveryMeta.audience === 'both' || discoveryMeta.isLiveTavily !== undefined) && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                    discoveryMeta.isLiveTavily
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-zinc-100 text-zinc-700 border-zinc-200/80'
                  }`}>
                    {discoveryMeta.isLiveTavily ? 'Live Tavily Web Search' : 'Tavily B2B'}
                  </span>
                )}
                {(discoveryMeta.audience === 'B2C' || discoveryMeta.audience === 'both' || discoveryMeta.isLiveGeoapify !== undefined) && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                    discoveryMeta.isLiveGeoapify
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-zinc-100 text-zinc-700 border-zinc-200/80'
                  }`}>
                    {discoveryMeta.isLiveGeoapify ? 'Live Geoapify Places' : 'Geoapify B2C'}
                  </span>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-600 mt-1">
            Ranked by AI fit score against your offering criteria
          </p>
          {discoveryMeta?.notice && (
            <p className="text-xs text-zinc-600 mt-2" role="status">
              {discoveryMeta.notice}
            </p>
          )}
        </div>

        {/* Aggregate KPI chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 shadow-2xs">
            <span className="text-zinc-600">Avg Fit: </span>
            <span className="font-semibold text-zinc-900">{avgScore}%</span>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 shadow-2xs">
            <span className="text-zinc-600">B2B Leads: </span>
            <span className="font-semibold text-zinc-900">{b2bCount}</span>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 shadow-2xs">
            <span className="text-zinc-600">B2C Places: </span>
            <span className="font-semibold text-zinc-900">{b2cCount}</span>
          </div>
          <button
            onClick={downloadCsv}
            disabled={leads.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download Excel (CSV)
          </button>
          <button
            onClick={onNewSearch}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800 transition-colors shadow-2xs text-xs cursor-pointer ml-auto sm:ml-0"
          >
            Refine Query
          </button>
        </div>
      </div>

      {/* Filter and search controls bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Type tabs */}
        <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 text-xs font-medium">
          <button
            onClick={() => {
              setCurrentPage(1)
              setFilterType('all')
            }}
            className={`rounded-md px-3 py-1.5 transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            All Types ({leads.length})
          </button>
          <button
            onClick={() => {
              setCurrentPage(1)
              setFilterType('B2B')
            }}
            className={`flex items-center space-x-1.5 rounded-md px-3 py-1.5 transition-all cursor-pointer ${
              filterType === 'B2B'
                ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Building2 className="w-3 h-3 text-indigo-500" />
            <span>B2B Only ({b2bCount})</span>
          </button>
          <button
            onClick={() => {
              setCurrentPage(1)
              setFilterType('B2C')
            }}
            className={`flex items-center space-x-1.5 rounded-md px-3 py-1.5 transition-all cursor-pointer ${
              filterType === 'B2C'
                ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Store className="w-3 h-3 text-emerald-500" />
            <span>B2C Places ({b2cCount})</span>
          </button>
        </div>

        {/* Local search filter */}
        <div className="relative min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setCurrentPage(1)
              setSearchQuery(e.target.value)
            }}
            placeholder="Filter table results..."
            className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-600 focus:border-zinc-400 focus:outline-hidden shadow-2xs"
          />
        </div>
      </div>

      {/* Main Results Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            {/* Table Header */}
            <thead className="border-b border-zinc-200/80 bg-zinc-50/80 text-[11px] font-medium uppercase tracking-wider text-zinc-600 select-none">
              <tr>
                <th
                  scope="col"
                  className="py-3 px-4 w-[28%] cursor-pointer hover:text-zinc-900"
                  onClick={() => toggleSort('name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Name & Organization</span>
                    <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                  </div>
                </th>
                <th scope="col" className="py-3 px-4 w-[12%]">
                  Type
                </th>
                <th
                  scope="col"
                  className="py-3 px-4 w-[12%] cursor-pointer hover:text-zinc-900"
                  onClick={() => toggleSort('fitScore')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Fit Score</span>
                    <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                  </div>
                </th>
                <th scope="col" className="py-3 px-4 w-[33%]">
                  AI Fit Rationale
                </th>
                <th scope="col" className="py-3 px-4 w-[15%] text-right">
                  Contact / Link
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-zinc-100">
              {pageLeads.map((lead, index) => (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="group hover:bg-zinc-50/80 transition-colors cursor-pointer"
                >
                  {/* Name Column */}
                  <td className="py-3.5 px-4 align-top">
                    <div className="flex items-start space-x-3">
                      <span className="font-mono text-[11px] font-medium text-zinc-600 mt-0.5">
                        {String(pageStart + index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <div className="font-semibold text-zinc-900 text-[13px] group-hover:text-indigo-600 transition-colors flex items-center">
                          {lead.type === 'B2B' ? lead.company || lead.name : lead.name}
                        </div>
                        <div className="text-zinc-600 text-xs mt-0.5">
                          {lead.type === 'B2B' ? (
                            <span>{lead.name}</span>
                          ) : (
                            <span>
                              {lead.placeType ? `${lead.placeType} · ` : ''}
                              <strong className="font-medium text-zinc-800">{lead.company}</strong>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center text-[11px] text-zinc-600 mt-1">
                          <MapPin className="w-3 h-3 mr-1 text-zinc-400 shrink-0" />
                          <span className="truncate">{lead.location}</span>
                        </div>
                        {(lead.email || lead.phone || lead.contactStatus) && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-700">
                            {lead.email && (
                              <a
                                href={`mailto:${lead.email}`}
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex max-w-full items-center gap-1 truncate hover:text-indigo-700"
                                title={lead.email}
                              >
                                <Mail className="h-3 w-3 shrink-0 text-zinc-500" />
                                <span className="truncate">{lead.email}</span>
                              </a>
                            )}
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`}
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-1 hover:text-indigo-700"
                              >
                                <Phone className="h-3 w-3 shrink-0 text-zinc-500" />
                                {lead.phone}
                              </a>
                            )}
                            {!lead.email && !lead.phone && lead.contactStatus && (
                              <span className="text-zinc-500">{lead.contactStatus}</span>
                            )}
                            {lead.contactSource && (lead.email || lead.phone) && (
                              <span className="text-zinc-500">via {lead.contactSource}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Type Column */}
                  <td className="py-3.5 px-4 align-top">
                    {lead.type === 'B2B' ? (
                      <span className="inline-flex items-center rounded-md bg-indigo-50/80 border border-indigo-200/70 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                        <Building2 className="w-3 h-3 mr-1 text-indigo-500" />
                        B2B
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-emerald-50/80 border border-emerald-200/70 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <Store className="w-3 h-3 mr-1 text-emerald-500" />
                        B2C
                      </span>
                    )}
                  </td>

                  {/* Fit Score Column */}
                  <td className="py-3.5 px-4 align-top">
                    {getScoreBadge(lead.fitScore)}
                  </td>

                  {/* Reason Column */}
                  <td className="py-3.5 px-4 align-top">
                    <p className="text-zinc-600 leading-relaxed line-clamp-2 pr-2">
                      {lead.reason}
                    </p>
                    {lead.tags && lead.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {lead.tags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="inline-flex rounded-sm bg-zinc-100 px-1.5 py-0.2 text-[10px] font-medium text-zinc-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Contact / Link Column */}
                  <td className="py-3.5 px-4 align-top text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      {lead.contactUrl && (
                        <a
                          href={lead.contactUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={lead.type === 'B2B' ? 'Web search source' : 'Location on Map'}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 shadow-2xs transition-colors"
                        >
                          {lead.type === 'B2B' ? (
                            <Globe className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                        </a>
                      )}

                      {lead.website && (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Website"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 shadow-2xs transition-colors"
                        >
                          <Globe className="h-3.5 w-3.5 text-zinc-500" />
                        </a>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectLead(lead)
                        }}
                        title="View Full Profile"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 shadow-2xs transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5 text-zinc-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="flex flex-col gap-2 border-t border-zinc-200/80 bg-zinc-50/50 px-4 py-2.5 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing <strong className="font-semibold text-zinc-900">
              {filteredLeads.length ? `${pageStart + 1}-${Math.min(pageStart + pageSize, filteredLeads.length)}` : '0'}
            </strong> of{' '}
            <strong className="font-semibold text-zinc-900">{filteredLeads.length}</strong> filtered (
            {leads.length} discovered entities
            )
          </span>
          <nav className="flex items-center justify-between gap-3 sm:justify-end" aria-label="Results pages">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <div className="flex items-center gap-1">
              {visiblePageNumbers.map((page, index) => page === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="px-1 text-zinc-500" aria-hidden="true">...</span>
              ) : (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  aria-label={`Page ${page}`}
                  aria-current={currentPage === page ? 'page' : undefined}
                  className={`min-w-7 rounded-md border px-2 py-1 ${
                    currentPage === page
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  )
}
