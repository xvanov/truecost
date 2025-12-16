import { PublicLayout } from '../components/layouts/PublicLayout';
import { teamMembers } from '../assets/team/teamMembers';

/**
 * About Us Page
 * Company information and team member profiles
 */
export function AboutUs() {

  const values = [
    {
      title: 'Accuracy',
      description: 'We believe every estimate should be as close to reality as possible. Our AI is continuously refined using real project data.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Innovation',
      description: 'We push the boundaries of what\'s possible in construction technology, bringing cutting-edge AI to an industry ready for transformation.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: 'Transparency',
      description: 'Every cost in our estimates is traceable and explainable. We show you exactly how we arrived at each number.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-truecost-cyan/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="container-spacious relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-truecost-glass-bg border border-truecost-glass-border mb-5">
              <span className="text-truecost-cyan text-sm font-medium">Our Story</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-heading font-bold text-truecost-text-primary mb-4">
              About <span className="text-truecost-cyan">TrueCost</span>
            </h1>
            
            <p className="text-xl text-truecost-text-secondary max-w-2xl mx-auto">
              We're on a mission to bring accuracy, speed, and transparency to construction 
              cost estimation through the power of artificial intelligence.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="pt-12 pb-40">
        <div className="container-spacious">
          <div className="max-w-4xl mx-auto">
            <div className="glass-panel p-8 md:p-12 rounded-2xl">
              <h2 className="text-3xl font-heading font-bold text-truecost-text-primary mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-truecost-text-secondary leading-relaxed mb-6">
                Construction cost estimation has long been a time-consuming, error-prone process 
                that relies heavily on experience and guesswork. We founded TrueCost to change that.
              </p>
              <p className="text-lg text-truecost-text-secondary leading-relaxed">
                By combining deep construction industry expertise with cutting-edge AI technology, 
                we've created a platform that generates accurate, detailed estimates in minutes 
                instead of days. Our goal is to empower contractors, architects, and project owners 
                with the information they need to make confident decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-truecost-glass-bg/30">
        <div className="container-spacious">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-truecost-text-primary mb-4">
              Our Values
            </h2>
            <p className="text-xl text-truecost-text-secondary">
              The principles that guide everything we do
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value) => (
              <div key={value.title} className="text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-truecost-cyan/10 border border-truecost-cyan/30 flex items-center justify-center text-truecost-cyan">
                  {value.icon}
                </div>
                <h3 className="text-2xl font-heading font-semibold text-truecost-text-primary mb-3">
                  {value.title}
                </h3>
                <p className="text-truecost-text-secondary">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20">
        <div className="container-spacious">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold text-truecost-text-primary mb-4">
              Meet the Team
            </h2>
            <p className="text-xl text-truecost-text-secondary">
              The people behind TrueCost
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {teamMembers.map((member, index) => (
              <div 
                key={index}
                className="glass-panel p-6 rounded-2xl hover:border-truecost-cyan/50 transition-colors"
              >
                {/* Headshot placeholder */}
                <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-truecost-glass-bg border-2 border-truecost-glass-border flex items-center justify-center overflow-hidden">
                  {member.image ? (
                    <img 
                      src={member.image} 
                      alt={member.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg className="w-16 h-16 text-truecost-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>
                
                <div className="text-center">
                  <h3 className="text-xl font-heading font-semibold text-truecost-text-primary mb-1">
                    {member.name}
                  </h3>
                  <p className={`text-truecost-cyan font-medium${member.desc || member.linkedin ? ' mb-3' : ''}`}>
                    {member.role}
                  </p>
                  {member.desc && (
                    <p className="text-truecost-text-secondary text-sm leading-relaxed mb-3">
                      {member.desc}
                    </p>
                  )}
                  {member.linkedin && (
                    <a 
                      href={member.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-truecost-text-muted hover:text-[#0A66C2] transition-colors"
                      aria-label={`${member.name}'s LinkedIn profile`}
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

