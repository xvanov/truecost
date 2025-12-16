import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../components/layouts/PublicLayout';

/**
 * Pricing Page
 * Display pricing plans - placeholder until business model is decided
 */
export function Pricing() {
  const [isYearly, setIsYearly] = useState(false);

  const plans = [
    {
      name: 'Trial',
      monthlyPrice: 'Free',
      yearlyPrice: 'Free',
      period: '',
      description: 'Try TrueCost with full capabilities',
      features: [
        '1 trial project',
        'Full AI analysis',
        'Detailed CSI breakdown',
        'Export to PDF',
      ],
      cta: 'Start Trial',
      highlighted: false,
    },
    {
      name: 'Professional',
      monthlyPrice: '$399',
      yearlyPrice: '$319',
      period: isYearly ? '/month' : '/month',
      description: 'For contractors and small teams',
      features: [
        'Unlimited projects',
        'Advanced AI analysis',
        'Priority support',
        'Detailed CSI breakdown',
        'Risk assessment',
        'Timeline generation',
      ],
      cta: 'Start Free Trial',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      monthlyPrice: 'Custom',
      yearlyPrice: 'Custom',
      period: '',
      description: 'For large organizations',
      features: [
        'Everything in Professional',
        'Custom integrations',
        'Dedicated account manager',
        'On-premise deployment',
        'SLA guarantee',
        'Custom AI training',
      ],
      cta: 'Contact Sales',
      highlighted: false,
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative pt-32 pb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-truecost-cyan/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="container-spacious relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border mb-5">
              <span className="text-truecost-cyan text-sm font-medium">Simple Pricing</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-heading font-bold text-truecost-text-primary mb-4">
              Choose Your <span className="text-truecost-cyan">Plan</span>
            </h1>
            
            <p className="text-xl text-truecost-text-secondary max-w-2xl mx-auto mb-8">
              Start free and scale as you grow. All plans include our core AI-powered estimation features.
            </p>

            {/* Monthly/Yearly Toggle */}
            <div className="inline-flex items-center gap-4 p-1.5 rounded-full bg-truecost-glass-bg border border-truecost-glass-border">
              <button
                onClick={() => setIsYearly(false)}
                className={`
                  px-6 py-2 rounded-full text-sm font-medium transition-all duration-200
                  ${!isYearly 
                    ? 'bg-truecost-cyan text-truecost-bg-primary' 
                    : 'text-truecost-text-secondary hover:text-truecost-text-primary'
                  }
                `}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={`
                  px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2
                  ${isYearly 
                    ? 'bg-truecost-cyan text-truecost-bg-primary' 
                    : 'text-truecost-text-secondary hover:text-truecost-text-primary'
                  }
                `}
              >
                Yearly
                <span className={`text-xs px-2 py-0.5 rounded-full ${isYearly ? 'bg-truecost-bg-primary/20' : 'bg-green-500/20 text-green-400'}`}>
                  Save 20%
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16">
        <div className="container-spacious">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => {
              const displayPrice = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
              const showYearlySavings = isYearly && plan.name === 'Professional';
              
              return (
                <div
                  key={plan.name}
                  className={`
                    glass-panel p-8 rounded-2xl relative
                    ${plan.highlighted 
                      ? 'border-truecost-cyan ring-1 ring-truecost-cyan/50' 
                      : 'hover:border-truecost-glass-border/80'
                    }
                    transition-all duration-300
                  `}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="bg-truecost-cyan text-truecost-bg-primary text-sm font-semibold px-4 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-heading font-bold text-truecost-text-primary mb-2">
                      {plan.name}
                    </h3>
                    <p className="text-truecost-text-muted text-sm mb-4">
                      {plan.description}
                    </p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-heading font-bold text-truecost-text-primary">
                        {displayPrice}
                      </span>
                      {plan.period && (
                        <span className="text-truecost-text-muted">{plan.period}</span>
                      )}
                    </div>
                    {showYearlySavings && (
                      <p className="text-green-400 text-sm mt-2">
                        Billed annually (${319 * 12}/year)
                      </p>
                    )}
                  </div>

                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <svg 
                          className="w-5 h-5 text-truecost-cyan flex-shrink-0 mt-0.5" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M5 13l4 4L19 7" 
                          />
                        </svg>
                        <span className="text-truecost-text-secondary">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={plan.name === 'Enterprise' ? '/contact' : '/signup'}
                    className={`
                      block w-full py-3 rounded-xl font-semibold text-center transition-colors
                      ${plan.highlighted
                        ? 'bg-truecost-cyan text-truecost-bg-primary hover:bg-truecost-cyan/90'
                        : 'bg-truecost-glass-bg border border-truecost-glass-border text-truecost-text-primary hover:border-truecost-cyan/50'
                      }
                    `}
                  >
                    {plan.cta}
                  </Link>
                </div>
              );
            })}
          </div>

          {/* FAQ or additional info */}
          <div className="text-center mt-16">
            <p className="text-truecost-text-muted">
              Have questions about our pricing?{' '}
              <Link to="/contact" className="text-truecost-cyan hover:underline">
                Contact our sales team
              </Link>
            </p>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
