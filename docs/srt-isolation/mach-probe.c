#include <mach/mach.h>
#include <servers/bootstrap.h>
#include <dlfcn.h>
#include <stdio.h>
int main(int argc, char **argv) {
    if (argc != 2) return 2;
    typedef kern_return_t (*lookup_t)(mach_port_t, const char *, mach_port_t *);
    lookup_t lookup = (lookup_t)dlsym(RTLD_DEFAULT, "bootstrap_look_up");
    if (!lookup) return 3;
    mach_port_t service = MACH_PORT_NULL;
    kern_return_t result = lookup(bootstrap_port, argv[1], &service);
    printf("%s: %d\n", argv[1], result);
    if (result == KERN_SUCCESS) { mach_port_deallocate(mach_task_self(), service); return 0; }
    return 77;
}
