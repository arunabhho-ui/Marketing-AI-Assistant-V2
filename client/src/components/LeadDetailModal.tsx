import type { FC } from 'react'
import {
  X,
  Building2,
  Store,
  MapPin,
  Globe,
  Phone,
  Mail,
  Sparkles,
  Users,
  Briefcase,
  CheckCircle2,
  ExternalLink
} from 'lucide-react'
import type { Lead } from '../types'

interface LeadDetailModalProps {
  lead: Lead | null
  onClose: () => void
}

export const LeadDetailModal: FC<LeadDetailModalProps> = ({ lead, onClose }) => {
  if (!lead) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                  lead.type === 'B2B'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {lead.type === 'B2B' ? (
                  <Building2 className="w-3 h-3 mr-1" />
                ) : (
                  <Store className="w-3 h-3 mr-1" />
                )}
                {lead.type} Lead
              </span>
              <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                {lead.fitScore}/100 Fit Score
              </span>
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 mt-2">
              {lead.type === 'B2B' ? lead.companyName || lead.company || lead.name : lead.name}
            </h3>
            <p className="text-xs text-zinc-600">
              {lead.type === 'B2B'
                ? `Found via: ${lead.name}`
                : `${lead.title ? `${lead.title} at ` : ''}${lead.company || ''}`}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* AI Fit Rationale */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <h4 className="text-xs font-semibold text-indigo-900 flex items-center mb-1">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
              Groq AI Fit Analysis
            </h4>
            <p className="text-xs text-indigo-950 leading-relaxed">{lead.reason}</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3">
              <span className="text-zinc-600 flex items-center mb-1">
                <MapPin className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                Location
              </span>
              <p className="font-medium text-zinc-900">{lead.location}</p>
              {lead.address && <p className="text-[11px] text-zinc-600 mt-0.5">{lead.address}</p>}
            </div>

            {lead.industry && (
              <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3">
                <span className="text-zinc-600 flex items-center mb-1">
                  <Briefcase className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                  Industry
                </span>
                <p className="font-medium text-zinc-900">{lead.industry}</p>
              </div>
            )}

            {lead.employeeCount && (
              <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3">
                <span className="text-zinc-600 flex items-center mb-1">
                  <Users className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                  Company Size
                </span>
                <p className="font-medium text-zinc-900">{lead.employeeCount} employees</p>
              </div>
            )}

            {lead.phone && (
              <a href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`} className="rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3 hover:bg-zinc-100">
                <span className="text-zinc-600 flex items-center mb-1">
                  <Phone className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                  Phone{lead.phoneSource ? ` · ${lead.phoneSource}` : ''}
                </span>
                <p className="font-medium text-zinc-900">{lead.phone}</p>
              </a>
            )}

            {lead.email && (
              <a href={`mailto:${lead.email}`} className="rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3 hover:bg-zinc-100 min-w-0">
                <span className="text-zinc-600 flex items-center mb-1">
                  <Mail className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                  Email{lead.emailSource ? ` · ${lead.emailSource}` : ''}
                </span>
                <p className="font-medium text-zinc-900 break-all">{lead.email}</p>
              </a>
            )}
          </div>

          <p className="text-[11px] text-zinc-500">
            {lead.contactStatus || (lead.phone || lead.email ? 'Contact found' : 'No public contact found')}
            {lead.contactSource ? ` · ${lead.contactSource}` : ''}
            {lead.contactConfidence ? ` · ${lead.contactConfidence}` : ''}
            {lead.websiteVerification ? ` · ${lead.websiteVerification}` : ''}
          </p>

          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <div>
              <span className="text-xs font-medium text-zinc-700 block mb-1.5">Identified Signals</span>
              <div className="flex flex-wrap gap-1.5">
                {lead.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200/60"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 mr-1" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {lead.contactUrl && (
              <a
                href={lead.contactUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs"
              >
                {lead.type === 'B2B' ? (
                  <>
                    <Globe className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                    Web source
                  </>
                ) : (
                  <>
                    <MapPin className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                    Maps
                  </>
                )}
                <ExternalLink className="w-3 h-3 ml-1 text-zinc-400" />
              </a>
            )}

            {lead.website && (
              <a
                href={lead.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-2xs"
              >
                <Globe className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
                Official website
                <ExternalLink className="w-3 h-3 ml-1 text-zinc-400" />
              </a>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
