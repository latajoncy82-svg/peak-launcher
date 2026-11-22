package com.peaklauncher.dns;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.net.spi.InetAddressResolver;
import java.net.spi.InetAddressResolverProvider;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * Resolves .peak hostnames (and bare "peak") to loopback (127.0.0.1) so
 * PeakDomainRouter can route Minecraft connections by Handshake serverAddress,
 * while delegating every other hostname and reverse lookup to Java's built-in resolver.
 */
public final class PeakDnsResolverProvider extends InetAddressResolverProvider {
    private static final byte[] LOOPBACK_V4 = new byte[] { 127, 0, 0, 1 };

    @Override
    public InetAddressResolver get(Configuration configuration) {
        final InetAddressResolver builtin = configuration.builtinResolver();
        return new InetAddressResolver() {
            @Override
            public Stream<InetAddress> lookupByName(String host, LookupPolicy lookupPolicy)
                    throws UnknownHostException {
                if (isPeakDomain(host)) {
                    String cleanHost = stripTrailingDot(host.trim());
                    return Stream.of(InetAddress.getByAddress(cleanHost, LOOPBACK_V4));
                }
                return builtin.lookupByName(host, lookupPolicy);
            }

            @Override
            public String lookupByAddress(byte[] addr) throws UnknownHostException {
                return builtin.lookupByAddress(addr);
            }
        };
    }

    @Override
    public String name() {
        return "PeakLauncherDnsResolverProvider";
    }

    private static boolean isPeakDomain(String host) {
        if (host == null) {
            return false;
        }
        String clean = stripTrailingDot(host.trim().toLowerCase(Locale.ROOT));
        if (clean.isEmpty()) {
            return false;
        }
        return "peak".equals(clean) || (clean.endsWith(".peak") && clean.length() > 5 && !clean.startsWith("."));
    }

    private static String stripTrailingDot(String host) {
        if (host.endsWith(".") && host.length() > 1) {
            return host.substring(0, host.length() - 1);
        }
        return host;
    }
}
