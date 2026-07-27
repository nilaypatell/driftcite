#!/bin/sh
# Reject commits from an unexpected identity.
#
# A bare noreply@users.noreply.github.com once credited a real stranger who
# owns the GitHub username "noreply" with commits on this repository. GitHub
# matches commits to accounts purely by email, so any <word>@users.noreply
# address silently credits whoever owns that name. This guard exists so that
# cannot happen twice.
ALLOWED="quickcruit@gmail.com 77018379+nilaypatell@users.noreply.github.com"
FAILED=0
RANGE="${1:-HEAD~1..HEAD}"

for email in $(git log --pretty='%ae%n%ce' "$RANGE" 2>/dev/null | sort -u); do
  case " $ALLOWED " in
    *" $email "*) ;;
    *) echo "rejected commit identity: $email"; FAILED=1 ;;
  esac
done

[ "$FAILED" = 0 ] && echo "commit identities ok"
exit $FAILED
