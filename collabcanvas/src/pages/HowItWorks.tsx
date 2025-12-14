import { Link } from 'react-router-dom';
import { PublicLayout } from '../components/layouts/PublicLayout';

/**
 * How It Works Page
 * Explains the TrueCost workflow and features in detail
 */
export function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Define Your Project',
      description:
        'Start by entering your project details including location, type, and size. Upload your floor plans or blueprints in PDF, PNG, or JPG format. Our system accepts both professional CAD drawings and hand-drawn sketches.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      number: '02',
      title: 'Annotate Your Blueprint',
      description:
        'Use our intuitive canvas tools to mark walls, rooms, doors, windows, and fixtures on your uploaded plans. Our AI-assisted annotation system helps identify elements automatically, saving you time and ensuring accuracy.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
    },
    {
      number: '03',
      title: 'AI Analysis',
      description:
        'Our deep agent pipeline processes your annotations through multiple specialized AI agents: Location Analysis for regional pricing, Scope Validation for quantity verification, Cost Estimation, Risk Assessment, and Timeline Generation.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      number: '04',
      title: 'Review Your Estimate',
      description:
        'Receive a comprehensive cost breakdown organized by CSI divisions. View material costs, labor estimates, equipment needs, and timeline projections. Export professional PDF reports for clients or contractors.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  const features = [
    {
      title: 'AI-Powered Quantity Extraction',
      description: 'Automatically extract quantities from your annotated blueprints using advanced computer vision and machine learning.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: 'Location-Based Pricing',
      description: 'Get accurate cost estimates based on your specific location, accounting for regional labor rates and material costs.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      title: 'CSI Division Breakdown',
      description: 'Estimates organized by Construction Specifications Institute divisions for industry-standard reporting.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      title: 'Risk Assessment',
      description: 'Identify potential project risks and receive recommendations to mitigate cost overruns and delays.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      title: 'Timeline Generation',
      description: 'Receive realistic project timelines based on scope, complexity, and resource availability.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: 'Professional Reports',
      description: 'Export detailed PDF estimates suitable for client presentations, contractor bids, and project planning.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative pt-32 pb-8 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-truecost-cyan/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="container-spacious relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border mb-5">
              <span className="text-truecost-cyan text-sm font-medium">Step-by-Step Guide</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-heading font-bold text-truecost-text-primary mb-4">
              How <span className="text-truecost-cyan">TrueCost</span> Works
            </h1>
            
            <p className="text-xl text-truecost-text-secondary max-w-2xl mx-auto">
              From blueprint to detailed estimate in minutes. Our AI-powered platform streamlines 
              construction cost estimation with precision and speed.
            </p>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="py-20">
        <div className="container-spacious">
          <div className="space-y-16">
            {steps.map((step, index) => (
              <div 
                key={step.number}
                className={`flex flex-col ${index % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12`}
              >
                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-5xl font-heading font-bold text-truecost-cyan/30">
                      {step.number}
                    </span>
                    <div className="w-12 h-12 rounded-xl bg-truecost-cyan/10 border border-truecost-cyan/30 flex items-center justify-center text-truecost-cyan">
                      {step.icon}
                    </div>
                  </div>
                  <h3 className="text-3xl font-heading font-bold text-truecost-text-primary mb-4">
                    {step.title}
                  </h3>
                  <p className="text-lg text-truecost-text-secondary leading-relaxed">
                    {step.description}
                  </p>
                </div>
                
                {/* Visual placeholder */}
                <div className="flex-1 w-full">
                  <div className="aspect-video rounded-2xl bg-truecost-glass-bg border border-truecost-glass-border flex items-center justify-center">
                    <div className="text-center p-8">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-truecost-cyan/10 border border-truecost-cyan/30 flex items-center justify-center text-truecost-cyan">
                        {step.icon}
                      </div>
                      <p className="text-truecost-text-muted text-sm">
                        Visual demonstration coming soon
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-truecost-glass-bg/30">
        <div className="container-spacious">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-truecost-text-primary mb-4">
              Powerful Features
            </h2>
            <p className="text-xl text-truecost-text-secondary max-w-2xl mx-auto">
              Everything you need for accurate construction cost estimation
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div 
                key={feature.title}
                className="glass-panel p-6 rounded-2xl hover:border-truecost-cyan/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-truecost-cyan/10 border border-truecost-cyan/30 flex items-center justify-center text-truecost-cyan mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-heading font-semibold text-truecost-text-primary mb-2">
                  {feature.title}
                </h3>
                <p className="text-truecost-text-secondary">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container-spacious">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-4xl font-heading font-bold text-truecost-text-primary mb-6">
              Ready to Get Started?
            </h2>
            <p className="text-xl text-truecost-text-secondary mb-8">
              Create your first estimate in minutes. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup" className="btn-pill-primary text-lg px-8 py-3">
                Get Started Free
              </Link>
              <Link to="/contact" className="btn-utility text-lg px-8 py-3">
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

